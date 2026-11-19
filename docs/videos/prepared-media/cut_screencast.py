import subprocess, os, json
DEMO="周会自动创建Bot/assets/功能演示.mp4"
INST="周会自动创建Bot/assets/脚本安装.mp4"
OUT="prepared-media/seg"; os.makedirs(OUT,exist_ok=True)
SEG=[
 ("01-install", INST, 16.80, 3.20),
 ("02-menu",    DEMO,  0.30, 2.80),
 ("03-config",  DEMO,  3.40, 5.20),
 ("04-run",     DEMO, 21.00, 2.60),
 ("05-board",   DEMO, 24.00, 3.10),
 ("06-form",    DEMO, 27.30, 6.20),
 ("07-topic",   DEMO, 35.40, 5.20),
 ("08-board2",  DEMO, 43.40, 2.40),
 ("09-list",    DEMO, 46.90, 2.40),
 ("10-detail",  DEMO, 50.90, 3.40),
]
FILT=("[0:v]scale=320:180:force_original_aspect_ratio=increase,crop=320:180,gblur=sigma=5,"
      "scale=1920:1080:flags=bicubic[bg];"
      "[0:v]scale=1920:-2,setsar=1[main];"
      "[bg][main]overlay=0:(H-h)/2:format=auto,format=yuv420p,fps=30")
for name,src,ss,dur in SEG:
    out=f"{OUT}/{name}.mp4"
    cmd=["ffmpeg","-v","error","-y","-ss",f"{ss:.2f}","-t",f"{dur:.2f}","-i",src,
         "-filter_complex",FILT,"-c:v","libx264","-preset","medium","-crf","20","-an",out]
    r=subprocess.run(cmd,capture_output=True,text=True)
    print(("OK  " if r.returncode==0 else "FAIL"),name,dur, r.stderr.strip()[:120])
with open(f"{OUT}/list.txt","w") as f:
    for name,_,_,_ in SEG: f.write(f"file '{name}.mp4'\n")
total=sum(d for _,_,_,d in SEG)
print("concat total:",total,"s")
