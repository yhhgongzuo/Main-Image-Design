# 上游读取、复用与替换记录

上游出处：https://github.com/ninemouth/sellerpilot-product-image-industrial（仅归属说明，不是更新源）。开发时读取本机已安装版本，MIT 许可。

## 实际执行链

- SKILL.md / AGENTS.md：要求更新检查、normalized task、产品证据、锚点、Provider 路由、全量 QA 与 tldraw。V1.0 不复制这组调度规则。
- package.json：包含 sync/update、Provider 配置、第三方 runtime 与完整验证脚本。新包只保留独立名称、版本、test/verify，无 repository/updater/provider 配置。
- compile-production-plan.mjs：读取 production-contract、platform-overrides、normalized-task；createGenerationJobs 通过 imageCount 循环创建 IMG-01…，前若干标 anchor；每个 job 引用角色 prompt 与 source manifest。新 compilePlan 直接构建长度为 1 的 jobs，六格只存在 blueprint。
- production-orchestrator.mjs：依赖 DAG、输出 hash 缓存，执行 agent artifact handoff 或 generation controller，缺少宿主输出时暂停。新版由当前 Codex 按少量命令推进，避免复制全 DAG。
- generation-execution-controller.mjs：先 anchorJobs，再检查 anchor QA，剩余任务最多并发 2；runJob 调用 reference selector，再调用 dispatch。新版不存在 anchor/remaining 批次；claim 使用独占文件防止同 run 再领取。
- create-image-generation-dispatch.mjs：固定 Provider resolution，native 路径调用 create-native-imagegen-handoff，其他路径返回第三方 runtime command；role 规范只接受 IMG/POSTER/DETAIL。新版直接采用 COMPOSITE-01，不复用这一入口，避免角色数量和路由残留。
- resolve-image-provider.mjs：读取 Codex 配置、用户 Provider registry，auto 可考虑外部 profile。新版完全不导入/读取这些模块或配置，只检查当前宿主原生工具。
- create-native-imagegen-handoff.mjs：建立 handoff + ledger，实际工具由宿主执行。保留这种真实边界，新版不把创建交接文件当作执行成功。
- create-source-product-understanding.mjs：图像元数据与可选 OCR 创建待视觉填写工作表；source-product-understanding-gate 校验读图证据、文字事实和锁定传播。新版由 Codex 逐图读图，结构化 facts/source IDs/identity lock，并在编译前校验。
- select-source-references.mjs / lib/source-reference-policy.mjs：确认归属、角色价值、字节预算与 source ID 路由。复用 evidenceTagsForRole 映射，改变为整套证据覆盖选择，去掉文件名推断与 Provider registry 依赖。
- prepare-source-references.mjs：字节不变 analysis 原件、条件式 upload 派生。新版保持这条原则，用本机已可用 Pillow 实现确定性等比准备与实际文件解码，不依赖原技能 sharp 或缓存目录。
- identity-consistency-gate.mjs / marketing-gate-check.mjs：实际视觉 review 与独立商业任务/文案检查，不能只看尺寸。V3.1不复制生成后视觉检查与自动重试；样稿和成品由用户查看验收。
- visual-director、prompt-layering-subloop、product-identity-preservation、source-product-understanding：复用商品事实优先、身份/几何/微细节锁定、买家问题、镜头/光影/场景设计和分层指令方法；本地实现样稿及确认后的独立成图流程。
- workflows/ecommerce-product-image-generation.yaml：原流程明确总览不能代替独立成品、需独立输出；V1.0曾只交付合集；V3.0按用户新需求增加样稿确认后的独立成图，使用本地新实现，不复制上游执行器。

## 无运行依赖

仅 reference-roles.mjs 的映射代码做定向复用，其余执行器为独立轻量实现；文档改编保留 MIT LICENSE。没有绝对上游路径、node_modules 链接、旧 run 文件、自动更新或第三方 Provider 调用。
维护本版应在新目录修改并测试，不运行上游同步脚本。安装前后对原技能全部文件计算 SHA256，验证报告保存于开发交付材料。
