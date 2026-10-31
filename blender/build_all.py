"""
모든 에셋을 생성해 public/models/*.glb 로 내보내고 blender/blend/*.blend 로 저장.
    python3 blender/build_all.py            # 전체
    python3 blender/build_all.py tractor cow # 일부만
bpy 모듈(pip install bpy) 또는 Blender 실행파일(blender -b -P blender/build_all.py) 모두 지원.
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "models")
BLEND = os.path.join(HERE, "blend")

import common as C  # noqa: E402
from build_environment import ASSETS  # noqa: E402


def main(names):
    builders = dict(ASSETS)
    names = names or list(ASSETS)  # 기본: 환경 에셋만. 캐릭터는 build_character_relief.py
    report = []
    for n in names:
        t = time.time()
        builders[n]()
        st = C.stats()
        size = C.export_glb(os.path.join(OUT, f"{n}.glb"))
        bsize = C.save_blend(os.path.join(BLEND, f"{n}.blend"))
        report.append((n, st["objects"], st["tris"], size, bsize, time.time() - t))
        print(f"[{n:10s}] objs={st['objects']:3d} tris={st['tris']:6d} glb={size/1024:7.1f}KB blend={bsize/1024:7.1f}KB {time.time()-t:4.1f}s", flush=True)
    total_glb = sum(r[3] for r in report)
    print(f"TOTAL glb={total_glb/1024:.1f}KB  assets={len(report)}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1 :]
    main(args)
