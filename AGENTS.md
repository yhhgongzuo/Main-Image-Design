# 阿辉的主图设计维护规则

独立定制版 ahui-main-image-design，V3.17.0。只维护此技能，不运行上游更新器，不修改其他技能或全局模型设置。当前行为以SKILL.md和其阶段引用为准，发布说明中的历史规则不覆盖当前入口。

- 所有问题直接用普通聊天编号列表提出，不用问答弹窗、表单或交互提问工具。重点引导上传风格参考图；有明确风格图直接分析，不推荐三个选项。无风格图时必须进入独立第二环节，三个针对本品的文字方向供用户确认；已有文字偏好或用户只要一个推荐时可整理一个，仍需确认。只有用户明确把风格决定权交给AI才跳过。“按图片做／按现有资料做／没有参考图”不能代替风格委托。
- 风格第二环节使用style-preview展示当前方向快照，等待新的真实用户回复，再style-confirm；拟定不等于选定，不能同轮展开六图文案。风格、审核、六图预览和生成阶段均保留决策校验；引用与结构检查不能冒充自然语言授权验证。旧selected字段没有确认或明确委托证据时不能继续放行。
- 首轮产品信息与五组问题、coverage及角度记录的权威口径在references/intake-and-style.md；不能以“非必填”或照片足够为由跳过相关缺失资料询问。用户明确无资料后继续，不反复逼问。
- 按阶段读全指令；看到截断／省略必须补齐。长结果文件收据、逐项任务读取和恢复方式在references/runtime.md，不把收据当工具参数，不重复领取原任务。
- 国内与Amazon US分支、平台与语言独立；产品事实、图片角色和完整确认文案优先。风格图仅分析，产品白名单附件保持隔离，不做竞品搜索。
- 合集保留身份、风格、逐格执行说明；高清只依据当前单格、该格确认文案和能支持其可见结构的同款原图。
- 方案看过后单独“确认生成”授权首次小样；看过当前小样和完整数字菜单后，单独回复 1 或 2 才进入高清。新版使旧确认失效，真实用户回复不能伪造。用户明确修改授权本轮按目标区域编辑并合成，具体版本／换语言规则见相应阶段文档。
- 首次小样一次。高清逐格以已确认裁片调用生图，白底格只用该格裁片。首张成功回件直接交付，保留实际格式及尺寸。用户负责审图。首次高清程序仅裁切、读取、保存和分发。
- 高清批次必须依据用户对当前菜单的真实数字选择。1 新开六个可见聊天并行，2 在当前聊天逐张制作，不使用旧偏好代选。
- 对已有图片的编辑统一走 references/product-repair.md，用干净裁片和本区证据生成局部，原位柔边合成新版。覆盖小样、高清和独立图片。首次生成与用户指定修改分开执行。
- 全部本次成品按原编号逐张嵌入主对话交付，说明未回件编号及实际状态，固定提供完整成品目录绝对路径和「打开本次成品目录」入口。交付后只按本轮创建回执归档已结束的高清子任务。内部材料留 work，正式交付留 outputs。
- 功能升级先在非技能扫描目录备份旧版本。package/SKILL及发布／安装包清单同步版本；这是授权新发布基线，清单重建只登记文件，不冒充测试通过。保留旧原始清单和LICENSE。
- 环境适配仅按references/local-adaptation.md允许的接口层修改并登记，不能通过更改核心约束或删除校验来迎合宿主。不要把授权功能升级与环境适配混淆。
- 用户未禁止时，功能修改按需运行现有测试和验证。V3.10.1 当次用户要求不测试；后续更新按当次要求执行。

V3.17.0 更新前完整备份 V3.16.0 于 C:/Users/A/Documents/Codex/2026-11-20/new-chat-18/outputs/ahui-main-image-design-v3.16.0-backup.zip。按本次用户要求不测试，由用户在新窗口人工验收。

V3.16.0 更新前完整备份 V3.15.1 于本次工作区 outputs/ahui-main-image-design-v3.15.1-backup.zip。当次按用户要求不测试，由用户在新窗口人工验收。

V3.15.1 更新前完整备份 V3.15.0 于 C:/Users/A/Documents/Codex/2026-11-20/new-chat-15/outputs/ahui-main-image-design-v3.15.0-backup.zip。

V3.15.0 更新前已完整备份 V3.14.1，含旧清单和 LICENSE。备份位于本轮工作区 outputs/ahui-main-image-design-v3.14.1-backup.zip。

V3.14.1 更新前的完整 V3.14.0 备份于 C:/Users/A/Documents/Codex/2026-11-20/skill-skill-01-02-03-04/work/backup-ahui-main-image-design-v3.14.0。

V3.14.0 更新前的完整 V3.13.0 备份于 C:/Users/A/Documents/Codex/2026-11-20/skill-skill-01-02-03-04/work/backup-ahui-main-image-design-v3.13.0。

V3.13.0 更新前的完整 V3.12.0 备份于 C:/Users/A/Documents/Codex/2026-11-20/new-chat-10/work/backup-ahui-main-image-design-v3.12.0。

V3.12.0 更新前的完整 V3.11.0 备份于 C:/Users/A/Documents/Codex/2026-11-20/sku-sku-sku/work/backup-ahui-v3.11.0。

V3.11.0 更新前的完整 V3.10.1 备份于 C:/Users/A/Documents/Codex/2026-11-20/sku-sku-sku/work/backup-ahui-v3.10.1。

V3.10.1 更新前的完整 V3.10.0 备份于 C:/Users/A/Documents/Codex/2026-11-20/new-chat-5/work/backup-ahui-main-image-design-v3.10.0-before-delivery-format。

V3.10.0 升级前的完整 V3.9.2 备份于 C:/Users/A/Documents/Codex/2026-11-16/new-chat-2/work/backup-ahui-v3.9.2-before-3.10.0。

V3.9.2升级前的完整V3.9.1目录（含原始清单）备份于 C:/Users/A/Documents/Codex/2026-11-14/new-chat-28/work/skill-upgrade-v3.9.2/ahui-main-image-design-v3.9.1。此前V3.9.1升级前的完整V3.9.0目录仍位于 C:/Users/A/Documents/Codex/2026-11-14/skill-ai/work/skill-upgrade-v3.9.1/ahui-main-image-design-v3.9.0。回退时只处理ahui-main-image-design目标目录，先备份当前版本，保留用户任务及输出。
