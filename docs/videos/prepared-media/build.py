import subprocess, json, os
S="prepared-media"
def run(cmd, script=None):
    r=subprocess.run(cmd,capture_output=True,text=True)
    if r.returncode!=0:
        print("FAIL:", " ".join(cmd[:6]), r.stderr[-2500:]); raise SystemExit(1)
    print("OK  :", " ".join(cmd[5:8]))

# ---------- 1. 画面装配 ----------
fc = f"""
[0:v]trim=0:7.0,setpts=PTS-STARTPTS,scale=1920:1080:flags=bicubic,fps=30,format=yuv420p,settb=AVTB[v0];
[1:v]zoompan=z='min(zoom+0.00045,1.05)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,format=yuv420p,settb=AVTB[v1];
[2:v]scale=1920:1080,fps=30,format=yuv420p,settb=AVTB[v2];
[3:v]trim=4.4:9.6,setpts=PTS-STARTPTS,scale=1920:1080:flags=bicubic,fps=30,format=yuv420p,settb=AVTB[v3];
[4:v]zoompan=z='min(zoom+0.00045,1.05)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,format=yuv420p,settb=AVTB[v4];
[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[vout]
"""
open(f"{S}/fc-picture.txt","w").write(fc)
run(["ffmpeg","-v","error","-y",
 "-i","videos/周例会AI脚本-片头-痛点概念.mp4",
 "-loop","1","-i",f"{S}/cards/card1-pain.png",
 "-i",f"{S}/seg/screencast.mp4",
 "-i","videos/周例会AI脚本-片尾-成果机制.mp4",
 "-loop","1","-i",f"{S}/cards/card2-result.png",
 "-filter_complex_script",f"{S}/fc-picture.txt","-map","[vout]",
 "-c:v","libx264","-preset","slow","-crf","19","-pix_fmt","yuv420p","-r","30","-video_track_timescale","90000",
 f"{S}/picture.mp4"])

# ---------- 2. 字幕叠加 ----------
meta=json.load(open(f"{S}/voice-meta.json"))
order=["n01","n02","n03","n04","n05","n06","n07","n08","n09","n10"]
lead=1.20; gap=0.35
times={}; t=lead
for k in order:
    d=meta[k]["dur"]; times[k]=(round(t,2),round(t+d,2)); t+=d+gap
lines=["[0:v][1:v]overlay=0:0[v0]"]
inputs=["-i",f"{S}/picture.mp4","-i",f"{S}/subs/scrim.png"]
for i,k in enumerate(order):
    inputs += ["-i",f"{S}/subs/{k}.png"]
    lines.append(f"[v{i}][{i+2}:v]overlay=0:0:enable='between(t,{times[k][0]},{times[k][1]})'[v{i+1}]")
lines.append("[v10]null[vout]")
open(f"{S}/fc-subs.txt","w").write(";\n".join(lines))
run(["ffmpeg","-v","error","-y"]+inputs+["-filter_complex_script",f"{S}/fc-subs.txt","-map","[vout]",
 "-c:v","libx264","-preset","slow","-crf","19","-pix_fmt","yuv420p","-r","30","-video_track_timescale","90000",
 f"{S}/picture_sub.mp4"])

# ---------- 3. 混音 ----------
V=58.07
a=["[1:a]atrim=0:%f,asetpts=N/SR/TB,volume=0.17,afade=t=in:st=0:d=1.2,afade=t=out:st=%f:d=3[bg]"%(V,V-3)]
for i,k in enumerate(order):
    a.append(f"[{i+2}:a]adelay={int(times[k][0]*1000)}|{int(times[k][0]*1000)}[v{i}]")
labels="[bg]"+"".join(f"[v{i}]" for i in range(len(order)))
a.append(f"{labels}amix=inputs={len(order)+1}:duration=longest:normalize=0[aout]")
open(f"{S}/fc-audio.txt","w").write(";\n".join(a))
cmd=["ffmpeg","-v","error","-y","-i",f"{S}/picture_sub.mp4","-i","assets/bgm.mp3"]
for k in order: cmd+=["-i",f"assets/voice/{k}.mp3"]
cmd+=["-filter_complex_script",f"{S}/fc-audio.txt","-map","0:v","-map","[aout]",
 "-c:v","copy","-c:a","aac","-b:a","192k","-ar","48000","-ac","2","-movflags","+faststart",
 "videos/周例会脚本产品介绍.mp4"]
run(cmd)
json.dump(times,open(f"{S}/sub-timings.json","w"),indent=1)
print("timeline:",times)
