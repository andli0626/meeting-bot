from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
W,H=2560,1440
OUT="prepared-media/cards"; os.makedirs(OUT,exist_ok=True)
FP="/System/Library/Fonts/Hiragino Sans GB.ttc"
def F(size,index=0): return ImageFont.truetype(FP,size,index=index)
def best_index():
    for i in range(6):
        try:
            n=ImageFont.truetype(FP,40,index=i).getname()[1]
            if "W6" in n or "Semibold" in n or "Bold" in n: return i
        except Exception: break
    return 0
BI=best_index()
def layer(): return Image.new("RGBA",(W,H),(0,0,0,0))
def base_bg(top,bot,glow,gx,gy,gr=0.70,ga=40):
    im=Image.new("RGB",(W,H)); d=ImageDraw.Draw(im)
    for y in range(H):
        t=y/(H-1); d.line([(0,y),(W,y)],fill=tuple(int(top[i]+(bot[i]-top[i])*t) for i in range(3)))
    gl=layer(); gd=ImageDraw.Draw(gl)
    cx,cy=int(W*gx),int(H*gy); r=int(W*gr*0.62)
    for i in range(r,0,-4):
        a=int(ga*(1-i/r)**2)
        gd.ellipse([cx-r+i,cy-r+i,cx+r-i,cy+r-i],fill=(*glow,a))
    gl=gl.filter(ImageFilter.GaussianBlur(120))
    return Image.alpha_composite(im.convert("RGBA"),gl)
def add_shadow(img,box,radius,blur=34,alpha=105):
    sh=layer(); ImageDraw.Draw(sh).rounded_rectangle(box,radius,fill=(0,0,0,alpha))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))

# ================= 卡1 痛点 =================
img=base_bg((10,15,21),(18,25,34),(255,176,104),0.16,0.08,gr=0.62,ga=30)
d=ImageDraw.Draw(img)
d.text((W//2,432),"人工建一条周例会",font=F(46),fill=(140,162,182),anchor="mm")
cols=[("13","次操作"),("20","个字段"),("3","层 iframe")]
gw,gap=460,150; x0=(W-(3*gw+2*gap))//2
for i,(num,unit) in enumerate(cols):
    cx=x0+i*(gw+gap)
    d.text((cx+gw//2,688),num,font=F(250,BI),fill=(240,246,251),anchor="mm")
    d.text((cx+gw//2,892),unit,font=F(52),fill=(134,156,176),anchor="mm")
sep=layer(); sd=ImageDraw.Draw(sep)
for i in range(2):
    sx=x0+(i+1)*gw+i*gap+gap//2
    sd.line([(sx,556),(sx,936)],fill=(255,255,255,30),width=2)
img.alpha_composite(sep)
d=ImageDraw.Draw(img)
d.text((W//2,1078),"每周重复一次",font=F(50),fill=(114,136,156),anchor="mm")
img.convert("RGB").save(f"{OUT}/card1-pain.png")

# ================= 卡2 成果 =================
img=base_bg((9,14,20),(17,24,33),(255,196,150),0.86,0.10,gr=0.55,ga=26)
d=ImageDraw.Draw(img)
d.text((W//2,398),"周例会自动创建脚本",font=F(108,BI),fill=(244,249,253),anchor="mm")
d.text((W//2,532),"研发4部-1组 · 新点 OA 周例会草稿自动生成",font=F(42),fill=(142,164,184),anchor="mm")
chips=[("13 步 → 1 次确认","人工只需核对固定的 4 处"),
       ("4 类易错点归零","期次 · 人名 · 会议室 · 议题"),
       ("零部署","换团队只改配置，不改代码")]
cw,ch=640,268; gap=90; x0=(W-(3*cw+2*gap))//2
for i,(a,b) in enumerate(chips):
    x=x0+i*(cw+gap); box=(x,650,x+cw,650+ch)
    add_shadow(img,box,48,blur=36,alpha=95)
    cl=layer(); cd=ImageDraw.Draw(cl)
    cd.rounded_rectangle(box,48,fill=(255,255,255,15),outline=(255,255,255,40),width=2)
    cd.text((x+cw//2,650+92),a,font=F(62,BI),fill=(246,250,254),anchor="mm")
    cd.text((x+cw//2,650+180),b,font=F(38),fill=(158,178,196),anchor="mm")
    img.alpha_composite(cl)
d=ImageDraw.Draw(img)
d.text((W//2,1124),"Tampermonkey 油猴脚本 v1.6.1 · 2583 行原生 JS · 已在真实 OA 投产运行",font=F(38),fill=(110,132,152),anchor="mm")
img.convert("RGB").save(f"{OUT}/card2-result.png")
print("cards re-rendered")
