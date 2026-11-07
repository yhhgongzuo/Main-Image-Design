# 用户主动修改合集

首次合集保存后，只有用户明确提出修改才调用。无需让用户额外再说一次确认；修改请求本身授权这一轮编辑。取消自动检测缺陷、自动重画和自动失败重试。换产品重新策划。

先按原生工具要求读取需要编辑的当前合集（这只是读取编辑输入，不做视觉自检报告）。保持原blueprint和首次结果不变，准备request.json：

```json
{"user_request":{"role":"user","message":"用户真实修改要求","message_id":"真实消息引用"}}
```

修改文字时在request中增加`panels`六条完整文案记录，字段为index/title/subtitle/extra_copy/copy_zh，以及`fact_review`说明新文案与产品事实的对应关系；未改文字沿用当前文案。完整尺码表、单位、脚注逐行放在extra_copy，不能省略或从小样猜测。普通文字修改只向用户说明改变的文案，不重新展示六图表。切换语言是例外，必须执行以下完整文案确认。

修改角度或展示细节时，同步增加`panel_sources`六条记录（index/source_ids/angle_evidence，其中angle_evidence含source_ids/limits），沿用未变格，仅更新受影响格。来源必须是已选产品原图白名单；没有对应角度证据先说明缺口，不能编造。新版小样的高清任务会继承这些对应关系，不继续用旧角度选图。

```powershell
node "<skill>/scripts/cli.mjs" composite-revise --run "<run>" --request "<run>/request.json" --capability "<run>/native-capability.json"
```

返回revision与tool_arguments。按 [平台适配](host-compatibility.md) 映射后调用一次已选生图工具，附件是当前合集＋产品原图。要求只调整用户指定内容，保留其他格、2列3行等分边界及首格白底无营销文案。完整图是同一模型重新生成，不能承诺其他格像素完全不变。

```powershell
node "<skill>/scripts/cli.mjs" composite-save --run "<run>" --revision 1 --image "<实际结果路径>" --host-evidence "<实际工具结果引用>"
node "<skill>/scripts/cli.mjs" hd-preview --run "<run>"
```

data URL结果先通过宿主文件能力保存为真实响应JSON，使用`--response`代替`--image`；不要打印base64。保存失败恢复同一结果，不再生成。返回后直接展示新版图片＋固定短文案，不自检。必须等用户看过新版再继续；旧确认失效。

明确失败时`composite-fail --run <run> --revision N --failure <file>`，failure含真实reason/host_evidence/definitive。结果未知用false继续等；明确无结果用true，不自动重试。可重新展示之前成功的小样并说明本次修改未完成，等用户决定，不偷偷回退后开始高清。

高清已开始后使用指定单图修改流程；不要重新裁切或重跑整套。

## 切换语言时先确认全部文案

在修改request中增加locale（如zh-CN），panels提供六条完整新版文案，fact_review说明事实未改变。保持旧inputs和blueprint不动。执行`copy-preview --run <run> --request <request.json>`，实际展示返回的preview，等待用户单独回复“确认生成”。然后在同一request加入`copy_confirmation:{role:"user",message:"确认生成",message_id:"新的真实消息引用",digest:"copy-preview返回值"}`，再执行composite-revise。请求或图片状态改变需重新预览确认。只提供翻译请求或旧确认不能生成。

新版小样仍按固定短文案展示，用户看过并同意后再继续高清；高清继承新版locale和准确文案，不能回退英文。
