"""
Extract video files from a potentially truncated Dropbox zip.
Falls back to carving MP4 data from raw bytes if zip is corrupt.
"""
import struct
import sys
import os


VIDEO_EXTENSIONS = {'.mp4', '.mov', '.m4v', '.avi', '.mkv'}


def try_zipfile_extract(zip_path, output_dir):
    """Try standard zipfile extraction."""
    import zipfile
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            video_names = [n for n in z.namelist()
                          if os.path.splitext(n)[1].lower() in VIDEO_EXTENSIONS]
            if not video_names:
                print("No video files in zip")
                return False
            for name in video_names:
                print(f"Extracting: {name}")
                z.extract(name, output_dir)
            return True
    except Exception as e:
        print(f"Zipfile extraction failed: {e}")
        return False


def carve_mp4s(zip_path, output_dir):
    """Carve MP4 files from raw bytes of a corrupt/truncated zip."""
    print("Attempting MP4 carving from raw bytes...")

    with open(zip_path, 'rb') as f:
        data = f.read()

    total_size = len(data)
    print(f"File size: {total_size / (1024*1024):.1f} MB")

    # Find MP4 ftyp box signatures
    ftyp_positions = []
    pos = 0
    while True:
        idx = data.find(b'ftyp', pos)
        if idx == -1:
            break
        if idx >= 4:
            box_size = struct.unpack('>I', data[idx-4:idx])[0]
            if 8 <= box_size <= 100:
                mp4_start = idx - 4
                ftyp_positions.append(mp4_start)
                print(f"Found MP4 signature at offset {mp4_start}")
        pos = idx + 1

    if not ftyp_positions:
        print("No MP4 files found in data!")
        return False

    # Also find zip local file headers to know where files end
    pk_positions = []
    pos = 0
    while True:
        idx = data.find(b'PK\x03\x04', pos)
        if idx == -1:
            break
        pk_positions.append(idx)
        pos = idx + 4

    extracted = 0
    for i, start in enumerate(ftyp_positions):
        # Find end of this MP4
        # Look for the next PK header after a reasonable amount of data
        end = total_size
        for pk in pk_positions:
            if pk > start + 10000:  # At least 10KB into the MP4
                # Check if there's another ftyp after this PK
                if i + 1 < len(ftyp_positions) and pk < ftyp_positions[i+1]:
                    end = pk
                    break

        if i + 1 < len(ftyp_positions):
            # Also cap at next MP4 start's PK header
            for pk in pk_positions:
                if pk >= ftyp_positions[i+1] - 200 and pk < ftyp_positions[i+1]:
                    end = min(end, pk)
                    break

        mp4_data = data[start:end]
        size_mb = len(mp4_data) / (1024*1024)

        if size_mb < 0.1:
            print(f"  Skipping tiny fragment ({size_mb:.2f} MB)")
            continue

        outpath = os.path.join(output_dir, f'recording_{i+1:02d}.mp4')
        with open(outpath, 'wb') as out:
            out.write(mp4_data)
        print(f"Extracted: recording_{i+1:02d}.mp4 ({size_mb:.1f} MB)")
        extracted += 1

    print(f"Carved {extracted} MP4 files")
    return extracted > 0


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <zip_path> <output_dir>")
        sys.exit(1)

    zip_path = sys.argv[1]
    output_dir = sys.argv[2]
    os.makedirs(output_dir, exist_ok=True)

    if not try_zipfile_extract(zip_path, output_dir):
        if not carve_mp4s(zip_path, output_dir):
            print("ERROR: Could not extract any video files!")
            sys.exit(1)


if __name__ == '__main__':
    main()
