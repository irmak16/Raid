#!/usr/bin/env python3
"""Raid! görsel hazırlayıcı.

Kullanım:  python3 tools/prepare_assets.py <ham_klasör> <assets_klasörü>

Ham klasördeki dosyalar oyundaki adlarıyla durur (ör. unit_toolbox.jpg).
- Sprite'lar: zemin rengi kenarlardan otomatik bulunur (magenta, pembe veya yeşil),
  kenardan taşma (flood fill) ile silinir, renk taşması temizlenir, kırpılır, küçültülür.
- bg_*: 1600 genişliğe ölçeklenip JPEG kaydedilir.
- fx_/ui_ sprite sayfaları: parçalara ayrılıp ayrı PNG'ler olarak kaydedilir.
"""
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

SPRITE_MAX = 300          # sprite'ların en uzun kenarı (px)
SHEET_ITEM_MAX = 160      # sprite sayfasından çıkan parçaların en uzun kenarı


def hue_sat_val(a):
    """a: HxWx3 float 0..1 -> hue (0..360), sat, val"""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1)
    mn = a.min(-1)
    d = mx - mn + 1e-6
    h = np.zeros_like(mx)
    m = mx == r
    h[m] = ((g - b)[m] / d[m]) % 6
    m2 = (mx == g) & ~m
    h[m2] = (b - r)[m2] / d[m2] + 2
    m3 = ~(m | m2)
    h[m3] = (r - g)[m3] / d[m3] + 4
    h = h * 60
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-6), 0)
    return h, s, mx


def hue_dist(h, h0):
    d = np.abs(h - h0) % 360
    return np.minimum(d, 360 - d)


def _label(mask):
    """4-bağlı bileşen etiketleme (saf numpy + BFS, küçük resimler için yeterli)."""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    sizes = [0]
    n = 0
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        if lab[y, x]:
            continue
        n += 1
        cnt = 0
        q = deque([(y, x)])
        lab[y, x] = n
        while q:
            cy, cx = q.popleft()
            cnt += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n
                    q.append((ny, nx))
        sizes.append(cnt)
    return lab, np.array(sizes)


def _big_regions(mask, min_px):
    lab, sizes = _label(mask)
    keep = sizes >= min_px
    keep[0] = False
    return keep[lab]


def _drop_specks(fg):
    """Ana objeye göre çok küçük kalan ayrık lekeleri (gölge kırıntıları) at."""
    lab, sizes = _label(fg)
    if len(sizes) <= 1:
        return fg
    biggest = sizes[1:].max()
    keep = sizes >= max(60, biggest * 0.05)
    keep[0] = False
    return keep[lab]


def key_background(img):
    """Kenarlardan zemin rengini bulur ve siler. RGBA döner."""
    rgb = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    H, W, _ = rgb.shape
    h, s, v = hue_sat_val(rgb)
    border = np.concatenate([h[0], h[-1], h[:, 0], h[:, -1]])
    bsat = np.concatenate([s[0], s[-1], s[:, 0], s[:, -1]])
    # dairesel ortalama ile zemin tonu
    ang = np.deg2rad(border[bsat > 0.3])
    h0 = (np.rad2deg(np.arctan2(np.sin(ang).mean(), np.cos(ang).mean())) + 360) % 360
    # zemin sayılacak pikseller: ton yakın, yeterince doygun
    bgish = (hue_dist(h, h0) < 24) & (s > 0.32) & (v > 0.18)

    seen = np.zeros((H, W), bool)
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if bgish[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if bgish[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        if y > 0 and not seen[y - 1, x] and bgish[y - 1, x]:
            seen[y - 1, x] = True; q.append((y - 1, x))
        if y < H - 1 and not seen[y + 1, x] and bgish[y + 1, x]:
            seen[y + 1, x] = True; q.append((y + 1, x))
        if x > 0 and not seen[y, x - 1] and bgish[y, x - 1]:
            seen[y, x - 1] = True; q.append((y, x - 1))
        if x < W - 1 and not seen[y, x + 1] and bgish[y, x + 1]:
            seen[y, x + 1] = True; q.append((y, x + 1))

    # kapalı boşluklar (kilit halkası, kupa kulpu vb.): saf magenta / yeşil zeminde,
    # zemin rengine çok yakın ve yeterince büyük iç bölgeleri de sil
    if hue_dist(np.array([h0]), 300)[0] < 22 or hue_dist(np.array([h0]), 120)[0] < 30:
        strict = (hue_dist(h, h0) < 16) & (s > 0.6) & (v > 0.5) & ~seen
        seen |= _big_regions(strict, min_px=max(120, H * W // 4000))

    seen = ~_drop_specks(~seen)

    alpha = Image.fromarray(np.where(seen, 0, 255).astype(np.uint8))
    # kenarı biraz içeri al ve yumuşat
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    a = np.asarray(alpha).astype(np.float32) / 255.0

    # renk taşmasını (despill) temizle: zemin tonuna yakın, kenara yakın pikselleri nötrle
    near_edge = np.asarray(Image.fromarray(np.where(seen, 255, 0).astype(np.uint8))
                           .filter(ImageFilter.MaxFilter(9))) > 0
    spill = near_edge & (hue_dist(h, h0) < 40) & (s > 0.15)
    out = rgb.copy()
    grey = out.mean(-1, keepdims=True)
    k = np.clip((s - 0.15) / 0.5, 0, 1)[..., None] * 0.85
    out = np.where(spill[..., None], out * (1 - k) + grey * k, out)

    rgba = np.dstack([np.clip(out * 255, 0, 255).astype(np.uint8), (a * 255).astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA")


def crop_alpha(im, pad=4):
    bb = im.getchannel("A").point(lambda p: 255 if p > 20 else 0).getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def fit(im, mx):
    s = mx / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return im


def components(rgba, min_area=600):
    """Saydam olmayan bağlı bölgeleri (sprite sayfası parçaları) bulur, satır-sütun sırasıyla döner."""
    a = np.asarray(rgba.getchannel("A")) > 40
    small = Image.fromarray((a * 255).astype(np.uint8)).resize((rgba.width // 4, rgba.height // 4))
    m = np.asarray(small.filter(ImageFilter.MaxFilter(5))) > 0
    H, W = m.shape
    lab = np.zeros((H, W), int)
    boxes = []
    n = 0
    for y in range(H):
        for x in range(W):
            if m[y, x] and not lab[y, x]:
                n += 1
                q = deque([(y, x)]); lab[y, x] = n
                y0 = y1 = y; x0 = x1 = x; cnt = 0
                while q:
                    cy, cx = q.popleft(); cnt += 1
                    y0, y1, x0, x1 = min(y0, cy), max(y1, cy), min(x0, cx), max(x1, cx)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; q.append((ny, nx))
                if cnt * 16 >= min_area:
                    boxes.append((x0 * 4, y0 * 4, (x1 + 1) * 4, (y1 + 1) * 4))
    # satırlara grupla
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows, cur = [], []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        if cur and abs(cy - np.mean([(c[1] + c[3]) / 2 for c in cur])) > 60:
            rows.append(sorted(cur, key=lambda c: c[0])); cur = []
        cur.append(b)
    if cur:
        rows.append(sorted(cur, key=lambda c: c[0]))
    return rows


# sprite sayfalarından alınacak parçalar: (satır, sütun) -> ad
SHEETS = {
    "fx_projectiles": {(0, 0): "proj_water", (0, 1): "proj_frost", (0, 2): "proj_marble", (0, 3): "proj_tennis",
                       (1, 0): "proj_nail", (1, 1): "proj_balloon", (1, 2): "proj_rocket", (1, 3): "proj_poison"},
    "fx_collectibles": {(0, 0): "item_screw", (0, 1): "item_screw_pile", (0, 2): "item_coin",
                        (1, 0): "item_blueprint", (1, 1): "item_star_silver", (1, 3): "item_star_gold"},
    "ui_icons": {(0, 0): "icon_pause", (0, 1): "icon_fast", (0, 2): "icon_shovel", (0, 3): "icon_lock",
                 (1, 0): "icon_heart", (1, 1): "icon_sound", (1, 2): "icon_mute", (1, 3): "icon_music",
                 (2, 0): "icon_book", (2, 1): "icon_wrench", (2, 2): "icon_trophy", (2, 3): "icon_map"},
    "ui_buttons": {(0, 0): "btn_yellow", (0, 1): "btn_yellow_pressed", (1, 1): "btn_grey",
                   (2, 0): "btn_play", (2, 1): "btn_close", (2, 2): "btn_settings"},
}


# düzgün ızgarada olan sayfalar: (sütun, satır) — parçalar hücre hücre kesilir
GRID_SHEETS = {"ui_icons": (4, 3)}


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    for fn in sorted(os.listdir(src)):
        name, ext = os.path.splitext(fn)
        if ext.lower() not in (".jpg", ".jpeg", ".png") or name == "style_ref":
            continue
        img = Image.open(os.path.join(src, fn))
        if name.startswith("bg_"):
            im = img.convert("RGB")
            s = 1600 / im.width
            im = im.resize((1600, round(im.height * s)), Image.LANCZOS)
            im.save(os.path.join(dst, name + ".jpg"), quality=86, optimize=True)
            print("bg     ", name, im.size)
            continue
        keyed = key_background(img)
        if name in GRID_SHEETS:
            cols, nrows = GRID_SHEETS[name]
            cw, ch = keyed.width / cols, keyed.height / nrows
            for (r, c), part in SHEETS[name].items():
                cell = keyed.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
                cell = Image.fromarray(np.dstack([np.asarray(cell)[..., :3],
                                                  np.asarray(cell)[..., 3] * _drop_specks(np.asarray(cell)[..., 3] > 40)]).astype(np.uint8), "RGBA")
                fit(crop_alpha(cell), SHEET_ITEM_MAX).save(os.path.join(dst, part + ".png"), optimize=True)
            print("grid   ", name)
            continue
        if name in SHEETS:
            rows = components(keyed)
            for (r, c), part in SHEETS[name].items():
                try:
                    box = rows[r][c]
                except IndexError:
                    print("  !! eksik parça", name, r, c)
                    continue
                piece = fit(crop_alpha(keyed.crop(box)), SHEET_ITEM_MAX)
                piece.save(os.path.join(dst, part + ".png"), optimize=True)
            print("sheet  ", name, [len(r) for r in rows])
            continue
        mx = SPRITE_MAX
        if name in ("ui_panel", "ui_card_frame", "ui_logo_emblem", "char_family_group"):
            mx = 640
        if name == "ui_wave_bar":
            mx = 900
        im = fit(crop_alpha(keyed), mx)
        im.save(os.path.join(dst, name + ".png"), optimize=True)
        print("sprite ", name, im.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
