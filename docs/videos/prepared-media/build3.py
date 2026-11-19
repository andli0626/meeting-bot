import subprocess, json, os
S="prepared-media"; ORDER=["n01","n02","n03","n04","n05","n06","n07","n08","n09","n10"]
meta=json.load(open(f"{S}/voice-meta.json")); txt=json.load(open(f"{S}/sub-texts.json"))
lead,gap=1.20,0.35; times={}; t=lead
for k in ORDER:
    d=meta[k]["dur"]; times[k]=(round(t,2),round(t+d,2)); t+=d+gap
V=58.07
def F(n): return ImageFont if False else n
# ---- inputs ----
inp=["-i","videos/周例会AI脚本-片头-痛点概念.mp4",
     "-i",f"{S}/cards/card1-pain.png",
     "-i",f"{S}/seg/screencast.mp4",
     "-i","videos/周例会AI脚本-片尾-成果机制.mp4",
     "-i",f"{S}/cards/card2-result.png",
     "-i",f"{S}/subs/scrim.png"]
for k in ORDER: inp+=["-i",f"{S}/subs/{k}.png"]
inp+=["-i","assets/bgm.mp3"]
for k in ORDER: inp+=["-i",f"assets/voice/{k}.mp3"]
# ---- video graph ----
g=[ "[0:v]trim=0:7.0,setpts=PTS-STARTPTS,scale=1920:1080:flags=bicubic,fps=30,setsar=1,format=yuv420p,settb=AVTB,fade=t=out:st=6.65:d=0.35[v0]",
    "[1:v]zoompan=z='min(zoom+0.0005,1.05)':d=114:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,format=yuv420p,settb=AVTB,fade=t=in:st=0:d=0.35,fade=t=out:st=3.5:d=0.3[v1]",
    "[2:v]scale=1920:1080,fps=30,setsar=1,format=yuv420p,settb=AVTB,fade=t=in:st=0:d=0.25[v2]",
    "[3:v]trim=4.4:9.6,setpts=PTS-STARTPTS,scale=1920:1080:flags=bicubic,fps=30,setsar=1,format=yuv420p,settb=AVTB,fade=t=in:st=0:d=0.3,fade=t=out:st=4.9:d=0.3[v3]",
    "[4:v]zoompan=z='min(zoom+0.0005,1.05)':d=138:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,format=yuv420p,settb=AVTB,fade=t=in:st=0:d=0.35,fade=t=out:st=4.0:d=0.6[v4]",
    "[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[base]",
    "[base][5:v]overlay=0:0:eof_action=repeat:shortest=0[b0]" ]
for i,k in enumerate(ORDER):
    a,b=times[k]; g.append(f"[b{i}][{6+i}:v]overlay=0:0:eof_action=repeat:enable='between(t,{a},{b})'[b{i+1}]")
g.append("[b10]null[vout]")
# ---- audio graph ----
ag=[f"[16:a]atrim=0:{V},asetpts=N/SR/TB,aresample=48000,aformat=channel_layouts=stereo,volume=0.17,afade=t=in:st=0:d=1.2,afade=t=out:st={V-3}:d=3[bg]"]
for i,k in enumerate(ORDER):
    ms=int(times[k][0]*1000)
    ag.append(f"[{17+i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[a{i}]")
ag.append("[bg]"+"".join(f"[a{i}]" for i in range(10))+"amix=inputs=11:duration=longest:normalize=0[aout]")
open(f"{S}/fc-all.txt","w").write(";\n".join(g+ag))
cmd=["ffmpeg","-v","error","-y","-stats"]+inp+["-filter_complex_script",f"{S}/fc-all.txt",
 "-map","[vout]","-map","[aout]","-t",str(V),
 "-c:v","libx264","-preset","medium","-crf","20","-pix_fmt","yuv420p","-r","30","-video_track_timescale","90000",
 "-c:a","aac","-b:a","192k","-ar","48000","-ac","2","-movflags","+faststart",
 "videos/周例会脚本产品介绍.mp4"]
r=subprocess.run(cmd)
print("rc",r.returncode)
json.dump(times,open(f"{S}/sub-timings.json","w"),indent=1)
