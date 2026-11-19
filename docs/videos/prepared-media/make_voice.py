import asyncio, edge_tts, json, subprocess, os
VOICE="zh-CN-YunxiNeural"; RATE="-4%"; PITCH="-2Hz"
segs=[
 ("n01","每周开会前，我们都要在 OA 上，手工建一条周例会。"),
 ("n02","13 次操作，20 个字段。"),
 ("n03","装一次扩展，以后每周，从菜单里点一次就够了。"),
 ("n04","配置框自动带出日期、期次、名称、议题和八位参会人。"),
 ("n05","确认执行，剩下交给脚本。"),
 ("n06","七步自动执行：打开看板、新增会议、填写信息、勾选参会和列席、添加议题、保存草稿。"),
 ("n07","每一步写完都回读校验，议题被回填覆盖了会自动重写。"),
 ("n08","草稿生成，人工只核对四处，就能提交。"),
 ("n09","四类易错点，结构性归零。"),
 ("n10","周例会自动创建脚本，v1.6.1。"),
]
async def main():
    meta={}
    for k,t in segs:
        p=f"assets/voice/{k}.mp3"
        c=edge_tts.Communicate(t, VOICE, rate=RATE, pitch=PITCH)
        await c.save(p)
        d=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p],capture_output=True,text=True).stdout.strip()
        meta[k]={"text":t,"dur":round(float(d),2),"chars":len(t),"rate":round(len(t)/float(d),2)}
        print(f"{k}: {meta[k]['dur']:.2f}s  {meta[k]['chars']}字  {meta[k]['rate']:.2f}字/秒")
    json.dump(meta,open("prepared-media/voice-meta.json","w"),ensure_ascii=False,indent=1)
asyncio.run(main())
