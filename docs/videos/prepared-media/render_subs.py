from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, json
W,H=1920,1080
OUT="prepared-media/subs"; os.makedirs(OUT,exist_ok=True)
FP="/System/Library/Fonts/Hiragino Sans GB.ttc"
F=ImageFont.truetype(FP,46,index=0)
meta=json.load(open("prepared-media/voice-meta.json"))
TXT={"n01":"每周开会前，我们都要在 OA 上，手工建一条周例会。","n02":"13 次操作，20 个字段。",
 "n03":"装一次扩展，以后每周，从菜单里点一次就够了。","n04":"配置框自动带出日期、期次、名称、议题和八位参会人。",
 "n05":"确认执行，剩下交给脚本。","n06":"七步自动执行：打开看板、新增会议、填写信息、勾选参会和列席、添加议题、保存草稿。",
 "n07":"每一步写完都回读校验，议题被回填覆盖了会自动重写。","n08":"草稿生成，人工只核对四处，就能提交。",
 "n09":"四类易错点，结构性归零。","n10":"周例会自动创建脚本，v1.6.1。"}
Y=952
for k,t in TXT.items():
    im=Image.new("RGBA",(W,H),(0,0,0,0))
    sh=Image.new("RGBA",(W,H),(0,0,0,0)); ds=ImageDraw.Draw(sh)
    ds.text((W//2,Y),t,font=F,fill=(0,0,0,190),anchor="mm",stroke_width=3,stroke_fill=(0,0,0,190))
    sh=sh.filter(ImageFilter.GaussianBlur(9))
    im.alpha_composite(sh)
    d=ImageDraw.Draw(im)
    d.text((W//2,Y),t,font=F,fill=(255,255,255,255),anchor="mm",stroke_width=1,stroke_fill=(0,0,0,120))
    im.save(f"{OUT}/{k}.png")
# 底部压暗渐变（常驻）
sc=Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(sc)
for y in range(H-260,H):
    a=int(112*((y-(H-260))/260)**1.7)
    d.line([(0,y),(W,y)],fill=(0,0,0,a))
sc.save("prepared-media/subs/scrim.png")
json.dump(TXT,open("prepared-media/sub-texts.json","w"),ensure_ascii=False)
print("subs ok")
