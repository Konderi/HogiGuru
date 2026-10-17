import numpy as np
from PIL import Image
import colorsys
from collections import deque

def process_hogiguru_logo(input_path, base_out_path, target_rgb=(242, 190, 58)):
    orig = Image.open(input_path).convert('RGB')
    arr = np.array(orig, dtype=np.float32) / 255.0
    h, w_img, _ = arr.shape
    
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    rangec = maxc - minc
    
    val = maxc
    sat = np.zeros_like(val)
    nonzero = maxc > 1e-5
    sat[nonzero] = rangec[nonzero] / maxc[nonzero]
    
    hue = np.zeros_like(val)
    rc = (maxc - r) / (rangec + 1e-7)
    gc = (maxc - g) / (rangec + 1e-7)
    bc = (maxc - b) / (rangec + 1e-7)
    
    m_r = (r == maxc) & (rangec > 1e-5)
    m_g = (g == maxc) & (rangec > 1e-5) & ~m_r
    m_b = (b == maxc) & (rangec > 1e-5) & ~m_r & ~m_g
    
    hue[m_r] = (bc[m_r] - gc[m_r])
    hue[m_g] = 2.0 + (rc[m_g] - bc[m_g])
    hue[m_b] = 4.0 + (gc[m_b] - rc[m_b])
    hue = ((hue / 6.0) % 1.0) * 360.0
    
    # Weight of gold elements
    hue_diff = np.abs(hue - 41.2)
    hue_weight = np.clip(1.0 - (hue_diff / 10.0), 0.0, 1.0)
    sat_weight = np.clip((sat - 0.22) / 0.15, 0.0, 1.0)
    val_weight = np.clip((val - 0.12) / 0.10, 0.0, 1.0)
    
    w = hue_weight * sat_weight * val_weight
    w = w * w * (3.0 - 2.0 * w)
    
    tr, tg, tb = target_rgb[0]/255.0, target_rgb[1]/255.0, target_rgb[2]/255.0
    th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)
    th_deg = th * 360.0
    
    target_h = hue + w * (th_deg - 41.2)
    target_s = np.clip(sat * (1.0 + w * ((ts / 0.624) - 1.0)), 0.0, 1.0)
    target_v = np.clip(val * (1.0 + w * ((tv / 0.824) - 1.0)), 0.0, 1.0)
    
    # Convert back to RGB
    th_norm = (target_h / 360.0) % 1.0
    hi = np.floor(th_norm * 6.0).astype(int) % 6
    f = (th_norm * 6.0) - np.floor(th_norm * 6.0)
    p = target_v * (1.0 - target_s)
    q = target_v * (1.0 - f * target_s)
    t = target_v * (1.0 - (1.0 - f) * target_s)
    
    out_r = np.zeros_like(val)
    out_g = np.zeros_like(val)
    out_b = np.zeros_like(val)
    
    m0, m1, m2, m3, m4, m5 = (hi == 0), (hi == 1), (hi == 2), (hi == 3), (hi == 4), (hi == 5)
    out_r[m0], out_g[m0], out_b[m0] = target_v[m0], t[m0], p[m0]
    out_r[m1], out_g[m1], out_b[m1] = q[m1], target_v[m1], p[m1]
    out_r[m2], out_g[m2], out_b[m2] = p[m2], target_v[m2], t[m2]
    out_r[m3], out_g[m3], out_b[m3] = p[m3], q[m3], target_v[m3]
    out_r[m4], out_g[m4], out_b[m4] = t[m4], p[m4], target_v[m4]
    out_r[m5], out_g[m5], out_b[m5] = target_v[m5], p[m5], q[m5]
    
    out_rgb = np.stack([out_r, out_g, out_b], axis=-1)
    final_rgb = arr * (1.0 - w[:,:,np.newaxis]) + out_rgb * w[:,:,np.newaxis]
    final_rgb_u8 = np.clip(final_rgb * 255.0, 0, 255).astype(np.uint8)
    
    # Save standard white-background PNG and JPEG
    out_img = Image.fromarray(final_rgb_u8)
    out_img.save(f"{base_out_path}.png", quality=100)
    out_img.save(f"{base_out_path}.jpeg", quality=96)
    print(f"Saved {base_out_path}.png and .jpeg")
    
    # Now generate transparent background version
    # Flood-fill outer white region
    visited = np.zeros((h, w_img), dtype=bool)
    is_outer_white = (final_rgb_u8[:,:,0] > 230) & (final_rgb_u8[:,:,1] > 230) & (final_rgb_u8[:,:,2] > 230)
    
    q_nodes = deque([(0, 0), (0, w_img-1), (h-1, 0), (h-1, w_img-1)])
    for y, x in q_nodes:
        visited[y, x] = True
        
    while q_nodes:
        y, x = q_nodes.popleft()
        for dy, dx in [(-1,0), (1,0), (0,-1), (0,1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w_img and not visited[ny, nx] and is_outer_white[ny, nx]:
                visited[ny, nx] = True
                q_nodes.append((ny, nx))
                
    # Create RGBA
    rgba = np.zeros((h, w_img, 4), dtype=np.uint8)
    rgba[:,:,:3] = final_rgb_u8
    rgba[:,:,3] = 255
    
    # Where visited is true, it is outer white
    # Compute smooth alpha for the anti-aliased edge to black
    # For visited pixels, alpha is 0
    rgba[visited, 3] = 0
    
    # Anti-alias transition: 1-pixel neighbor of visited that is partially white
    # Find boundary pixels
    # For boundary pixels with visited neighbor, alpha = 255 - mean(RGB)
    for dy, dx in [(-1,0), (1,0), (0,-1), (0,1)]:
        shifted_visited = np.roll(np.roll(visited, dy, axis=0), dx, axis=1)
        border_pts = shifted_visited & (~visited) & (final_rgb_u8[:,:,0] > 180)
        # Smooth alpha
        avg_val = np.mean(final_rgb_u8[border_pts], axis=1)
        alpha_val = np.clip((255.0 - avg_val) * 1.5, 0, 255).astype(np.uint8)
        rgba[border_pts, 3] = np.minimum(rgba[border_pts, 3], alpha_val)
        
    trans_img = Image.fromarray(rgba, 'RGBA')
    trans_img.save(f"{base_out_path}_transparent.png")
    print(f"Saved {base_out_path}_transparent.png")

if __name__ == '__main__':
    # Primary / Recommended version:
    # Target RGB: (242, 190, 58) -> Hex #F2BE3A (warm, rich, radiant heraldic gold)
    process_hogiguru_logo(
        'data/hogiguru_vaakuna1.jpeg',
        'data/hogiguru_vaakuna_kirkas_kulta',
        target_rgb=(242, 190, 58)
    )
