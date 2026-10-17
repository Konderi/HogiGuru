import os
import numpy as np
from PIL import Image
from collections import deque

def create_vaakuna_icons(input_path='data/hogiguru_vaakuna_kirkas_kulta.png'):
    img = Image.open(input_path).convert('RGB')
    arr = np.array(img, dtype=np.float32)
    h, w, _ = arr.shape

    # 1. Flood fill outer white background from corners
    is_white = (arr[:,:,0] > 235) & (arr[:,:,1] > 235) & (arr[:,:,2] > 235)
    visited = np.zeros((h, w), dtype=bool)

    q = deque([(0, 0), (0, w-1), (h-1, 0), (h-1, w-1)])
    for y, x in q:
        visited[y, x] = True

    while q:
        y, x = q.popleft()
        for dy, dx in [(-1,0), (1,0), (0,-1), (0,1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_white[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    # 2. Alpha calculation and edge defringing against white
    alpha = np.ones((h, w), dtype=np.float32)
    alpha[visited] = 0.0

    # Expand boundary by 2 pixels into the outer black stroke
    visited_dilated = visited.copy()
    for dy in [-2, -1, 0, 1, 2]:
        for dx in [-2, -1, 0, 1, 2]:
            if abs(dy) + abs(dx) <= 3:
                visited_dilated |= np.roll(np.roll(visited, dy, axis=0), dx, axis=1)

    boundary = visited_dilated & (~visited)
    min_rgb = arr[boundary].min(axis=1)
    edge_alpha = np.clip((255.0 - min_rgb) / 240.0, 0.0, 1.0)
    alpha[boundary] = edge_alpha

    # Defringe: remove white halo on dark backgrounds
    out_rgb = arr.copy()
    b_alpha = alpha[boundary, np.newaxis]
    nonzero = (b_alpha[:, 0] > 0.05)
    c_fg = (arr[boundary][nonzero] - (1.0 - b_alpha[nonzero]) * 255.0) / b_alpha[nonzero]
    c_fg = np.clip(c_fg, 0.0, 255.0)
    boundary_pts = np.argwhere(boundary)
    valid_pts = boundary_pts[nonzero]
    out_rgb[valid_pts[:, 0], valid_pts[:, 1]] = c_fg

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:,:,:3] = np.clip(out_rgb, 0, 255).astype(np.uint8)
    rgba[:,:,3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)

    # 3. Crop tightly to shield bounding box
    y_indices, x_indices = np.where(alpha > 0.05)
    y_min, y_max = y_indices.min(), y_indices.max()
    x_min, x_max = x_indices.min(), x_indices.max()

    cropped_rgba = rgba[y_min:y_max+1, x_min:x_max+1]
    cropped_vaakuna = Image.fromarray(cropped_rgba)
    w_v, h_v = cropped_vaakuna.size

    os.makedirs('public', exist_ok=True)
    os.makedirs('data', exist_ok=True)

    # Save tight-cropped original resolution
    cropped_vaakuna.save('public/hogiguru_vaakuna_ikoni_trimmed.png')
    cropped_vaakuna.save('data/hogiguru_vaakuna_ikoni_trimmed.png')
    print("Saved trimmed full-res version (589x731)")

    # Helper function to generate square centered icon
    def make_square_icon(size):
        margin = int(size * 0.04) # 4% margin
        target_h = size - 2 * margin
        scale = target_h / h_v
        target_w = int(w_v * scale)
        scaled = cropped_vaakuna.resize((target_w, target_h), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        paste_x = (size - target_w) // 2
        paste_y = margin
        canvas.paste(scaled, (paste_x, paste_y), scaled)
        return canvas

    # Primary square 512x512
    icon_512 = make_square_icon(512)
    icon_512.save('public/hogiguru_vaakuna_ikoni.png')
    icon_512.save('public/hogiguru_vaakuna_ikoni.webp', quality=95)
    icon_512.save('data/hogiguru_vaakuna_ikoni.png')
    print("Saved primary 512x512 icon (PNG & WebP)")

    # Multi-resolution square icons
    for s in [256, 128, 64, 32]:
        icon = make_square_icon(s)
        icon.save(f'public/hogiguru_vaakuna_ikoni_{s}.png')
        icon.save(f'data/hogiguru_vaakuna_ikoni_{s}.png')
        print(f"Saved {s}x{s} icon")

    # Clean up temporary test files
    for test_file in [
        'data/test_bottom_crop.png',
        'data/test_top_center.png',
        'data/test_cropped_vaakuna.png',
        'data/test_vaakuna_dark.png'
    ]:
        if os.path.exists(test_file):
            os.remove(test_file)

if __name__ == '__main__':
    create_vaakuna_icons()
