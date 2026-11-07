# 风格识别与 Global Style Lock V2.2

有一张或多张参考图时逐张看图，在source_ids记录全部登记的STYLE编号；提取共有配色、字体、光影与排版语言，明显冲突时先问主参考。不要只分析第一张，也不把多张参考机械拼成固定模板。有参考图按用户指定的参考范围分析，不提供三选一。先读 [商业视觉决策](commercial-art-direction.md)，填写 reference_intent 的 mode 与 basis；区分 full_style/selective/quality_only，无图为 none。origin=reference，风格图只能被Codex查看分析，不能附给最终生图；完成下述七层分析。无参考图时先完成文字三选一，origin=recommendation、option_id/name对应已选选项；只需写 reference_intent 及具体creative_summary、transferable、do_not_copy、set_rules、uncertainties，不需要填写虚构的七层视觉观察。两种路径都运行style建立锁。无论哪种路径都不生成小样图。

每项写具体观察与可迁移设计语言（详细分析仅内部使用），无法观察则明确说明，不把估算当测量。近似 HEX 写明“目测约”，不要把未采样色号当强制准确值。

1. **positioning**：dominant_style 主导类型、visual_temperament 核心气质。可以有组合风格，明确谁主导。
2. **color**：background、primary、secondary、accent、temperature、contrast、brightness_saturation、area_ratios、product_relationship。说清色彩的面积、明度层级和主体如何与背景分离；保持真实商品颜色，不能给商品换色迁就参考。
3. **typography**：family_character 字体视觉类型、weight_contrast、hierarchy、title_subtitle_relation、density、whitespace、alignment、product_relationship、brand_character。只描述可迁移字体气质，不猜具体商用字体名称。六张共享家族与层级，不要求标题同位置。
4. **photography**：angle、occupancy、depth_of_field、lens_feel、placement、material_rendering、realism、spatial_relationship；**lighting**：direction、hardness、highlights、shadows。焦距仅写观感；明确软硬光、阴影落点、材质细腻度等方法。
5. **background**：type、surfaces、depth_layers、focus_atmosphere、negative_space。说明几何空间、台面、渐变/真实环境、虚实和前后景的组织方式。
6. **composition**：symmetry、visual_center、text_product_relation、density、hierarchy、eye_path、impact、decoration。分析留白、视觉重心与冲击来源，不照搬具体广告布局。
7. **commercial_aesthetics**：quality_drivers、product_prominence、cleanliness、brand_feeling。指出美感来自克制光效、材质、摄影空间或字体对比，而非只写“高级”。

最后填写 name、reference_intent、transferable[]、do_not_copy[]、set_rules[]、uncertainties[]。transferable、set_rules与creative_summary描述本品选定语言，do_not_copy记录排除项，uncertainties记录不确定性；正向执行描述不能混入不采用的参考观察；set_rules写适用于整组的具体摄影、排版质量要求，逐图决策留在blueprint。do_not_copy 明确排除参考中的商品、Logo、品牌、标题和具体构图。报告不带图片路径、image URL/base64、source_images；图像归档在 inputs.json，设计报告只存语言。

`style` 输出不可变全局锁的计算 ID，策划的 global_style_lock_id 必须完全一致。改变 style-analysis 后要重新取得 ID 并检查六图策划。
增加必填 `creative_summary`：依据参考意图及本品适配取舍提炼一段自然语言，覆盖本品选定的整体气质、配色关系、字体气质、摄影光影质感、空间语言；quality_only不照搬参考配色。不要写固定背景、色彩面积、标题位置、产品占比或光源坐标；不固定套用某一行业示例。编译器发送此摘要及transferable/set_rules/do_not_copy的执行内容，不发送七层观察或原始JSON。关键设计要求不能只藏在观察字段；reference_intent.basis显示在确认预览中。全局锁保留全部分析用于追溯，摘要变化也会改变锁 ID 并使旧确认失效。
商品真实性和已确认平台规则优先。白底 listing 首图作为明确例外，其他图承接全局品牌语言。

## V1.2：提取规律，不锁定模板

详细字段中的 angle、alignment、direction、area_ratios 等仅记录参考图观察，不是六格执行模板。set_rules/creative_summary 只共享字体家族与气质、品牌配色关系、材质与摄影质量。不要全局锁死标题位置/大小/斜角/换行、标题底板、背景颜色或光源方向。参考的红色斜条、圆角卡片、渐变和箭头只是可选语言，不是六张必备元素。相同风格可容纳安静质感图、真实场景和强卖点海报，由各格卖点决定强弱。有图无需确认风格；无图只确认文字风格选择。风格选择只确定视觉方向，不是生成批准；所有任务仍必须展示完整六图文案和画面方案，等待用户单独回复“确认生成”。

无参考图的creative_summary依据选定文字方向写明背景/环境、配色关系、字体气质、光影质感，不能声称来自参考观察。产品真实颜色不随风格改变。首图白底规则优先，后五格承接风格；一致标题区域可以保留，重点是移动端可读与信息不重复。
