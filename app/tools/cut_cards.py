"""Cut single cards out of the two scan sheets, straighten them and save them for the game.

Nothing is redrawn: each card is the scanned pixels, rotated and resized. Only the white edge of
the card back is rebuilt, because white paper cannot be told apart from the scanner's white page.
Run: python cut_cards.py <folder with scans> <output folder>   (needs opencv, numpy)
"""
import sys
from pathlib import Path

import cv2
import numpy as np

W, H = 750, 1050
INSET = 4  # trims the pale halo the scanner leaves around each card


def find_rects(img, min_area):
    gray_gap = img.max(axis=2).astype(int) - img.min(axis=2).astype(int)
    mask = ((img.min(axis=2) < 235) | (gray_gap > 22)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return [cv2.minAreaRect(c) for c in contours if cv2.contourArea(c) > min_area]


def corners(rect):
    """Corners as top-left, top-right, bottom-right, bottom-left, for an upright card."""
    pts = cv2.boxPoints(rect)
    order = np.argsort(pts[:, 1])
    top = sorted(pts[order[:2]].tolist())
    bottom = sorted(pts[order[2:]].tolist())
    return np.float32([top[0], top[1], bottom[1], bottom[0]])


def warp(img, rect, width, height, inset=INSET):
    target = np.float32([[-inset, -inset], [width + inset, -inset], [width + inset, height + inset], [-inset, height + inset]])
    matrix = cv2.getPerspectiveTransform(corners(rect), target)
    return cv2.warpPerspective(img, matrix, (width, height), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)


def in_rows(rects, per_row):
    rects = sorted(rects, key=lambda r: r[0][1])
    rows = [sorted(rects[i:i + per_row], key=lambda r: r[0][0]) for i in range(0, len(rects), per_row)]
    return rows


def save(path, img):
    cv2.imwrite(str(path), img, [cv2.IMWRITE_JPEG_QUALITY, 88])


def build_back(interior):
    """White card with rounded corners around the scanned black panel."""
    border_x, border_y = 34, 34
    inner = cv2.resize(interior, (W - 2 * border_x, H - 2 * border_y), interpolation=cv2.INTER_LANCZOS4)
    card = np.full((H, W, 3), 245, np.uint8)
    card[border_y:H - border_y, border_x:W - border_x] = inner
    return card


def main(scans, out):
    out.mkdir(parents=True, exist_ok=True)
    first = cv2.imread(str(scans / 'cards-0-8.png'))
    second = cv2.imread(str(scans / 'cards-9-13-back.png'))
    min_area = 300_000

    rows = in_rows(find_rects(first, min_area), 3)
    print('first sheet rows', [len(r) for r in rows])
    ranks = [[0, 1, 2], [3, 4, 5], [6, 7, 8]]
    for row, names in zip(rows, ranks):
        for rect, rank in zip(row, names):
            print(rank, 'angle', round(rect[2], 2), 'size', [round(v) for v in rect[1]])
            save(out / f'c{rank}.jpg', warp(first, rect, W, H))

    rows = in_rows(find_rects(second, min_area), 3)
    print('second sheet rows', [len(r) for r in rows])
    for rect, rank in zip(rows[0], [9, 10, 11]):
        print(rank, 'angle', round(rect[2], 2), 'size', [round(v) for v in rect[1]])
        save(out / f'c{rank}.jpg', warp(second, rect, W, H))
    for rect, name in zip(rows[1], ['c13', 'c12', 'back']):
        print(name, 'angle', round(rect[2], 2), 'size', [round(v) for v in rect[1]])
        if name == 'back':
            save(out / 'back.jpg', build_back(warp(second, rect, W - 68, H - 68, inset=0)))
        else:
            save(out / f'{name}.jpg', warp(second, rect, W, H))


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
