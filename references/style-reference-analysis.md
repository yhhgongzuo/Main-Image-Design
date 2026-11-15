# 风格识别与 Global Style Lock V2.2

本文件保留原亚马逊风格分析。国内任务共用参考意图、七层观察与风格锁，并按[国内设计分支](domestic-design.md)补充visual_system；以下首格白底、标题大小不固定等亚马逊约定，在国内改为已确认白底格与统一字号档位。国内的颜色角色、字体层级、组件和间距标准必须进入最终提示词。国内优先保留已选参考中的框架分区、辅助小窗、纹理、图形叠层和光效的关系；摘要写具体组合，不能只提炼成配色、柔光和高级感。选定的关键构图方法可迁移并适配本品，不复制原广告作品。

国内V3.7：以[国内分支](domestic-design.md)为准。复用transferable列出通常4–6条最影响参考相似度的选定视觉特征，逐条写明形态、材质、密度、面积或前后层次及与商品／文字的关系；按参考实际内容取舍，不为凑数添加元素。creative_summary只写简明总体方向，visual_system补充字体、配色、组件和摄影执行规范，三者避免同义重复。国内编译把transferable完整带入一次，不再二次概括；详细七层观察仍留内部，set_rules主要用于分析约束，do_not_copy只列精简的迁移边界。框架指信息围合，不强制外框。原亚马逊字段和编译策略不变。

整体参考full_style须保留其关键背景、光影强度、装饰密度与图文关系，不能仅继承配色与字体；selective只写用户选定范围；quality_only不自动继承背景和配色。不要将“密集平行光丝弧面＋有厚度的镜面飘带＋前后交叠”压缩成“几条细线、少量光效”。这只是形态表述示例，不是所有产品的固定背景。已选特征进入逐图presentation/composition，说明在本格的位置、强弱及遮挡；白底格不套背景，已确认的情境格按自身角色适配。

有一张或多张参考图时逐张看图，在source_ids记录全部登记的STYLE编号；提取共有配色、字体、光影与排版语言，明显冲突时先问主参考。不要只分析第一张，也不把多张参考机械拼成固定模板。有明确用于风格的参考图时按用户指定范围分析，不推荐三个选项。先读 [商业视觉决策](commercial-art-direction.md)，填写 reference_intent 的 mode 与 basis；区分 full_style/selective/quality_only，无图为 none。origin=reference，风格图只能被Codex查看分析，不能附给最终生图；完成下述七层分析。

无参考图时，先按[补资料与选风格](intake-and-style.md)完成第二环节；即使用户已用文字描述偏好，也要整理为具体方向并取得确认。未给文字偏好时推荐三个针对本品的方向；已有文字偏好或用户只要一个推荐时，单项方向仍须确认。只有明确授权AI决定风格才可跳过。不能将产品图配色、“其他按图片做”或AI自己的方向推断写成用户选择。origin=recommendation、option_id/name必须对应已确认或明确委托的方向；只需写 reference_intent 及具体creative_summary、transferable、do_not_copy、set_rules、uncertainties，不需要填写虚构七层观察。两种路径都运行style建立锁，未完成风格决策不能锁定。首次风格阶段不额外生成样图；初稿后用户明确要求的替代方向见合集修改流程。

每项写具体观察与可迁移设计语言（详细分析仅内部使用），无法观察则明确说明，不把估算当测量。近似 HEX 写明“目测约”，不要把未采样色号当强制准确值。

1. **positioning**：dominant_style 主导类型、visual_temperament 核心气质。可以有组合风格，明确谁主导。
2. **color**：background、primary、secondary、accent、temperature、contrast、brightness_saturation、area_ratios、product_relationship。说清色彩的面积、明度层级和主体如何与背景分离；保持真实商品颜色，不能给商品换色迁就参考。
3. **typography**：family_character 字体视觉类型、weight_contrast、hierarchy、title_subtitle_relation、density、whitespace、alignment、product_relationship、brand_character。只描述可迁移字体气质，不猜具体商用字体名称。六张共享家族与层级，不要求标题同位置。
4. **photography**：angle、occupancy、depth_of_field、lens_feel、placement、material_rendering、realism、spatial_relationship；**lighting**：direction、hardness、highlights、shadows。焦距仅写观感；明确软硬光、阴影落点、材质细腻度等方法。
5. **background**：type、surfaces、depth_layers、focus_atmosphere、negative_space。说明几何空间、台面、渐变/真实环境、虚实和前后景的组织方式。
6. **composition**：symmetry、visual_center、text_product_relation、density、hierarchy、eye_path、impact、decoration。分析留白、视觉重心与冲击来源，不照搬具体广告布局。
7. **commercial_aesthetics**：quality_drivers、product_prominence、cleanliness、brand_feeling。指出美感来自光效强弱、材质、摄影空间、模块组织或字体对比，而非只写“高级”。

最后填写 name、reference_intent、transferable[]、do_not_copy[]、set_rules[]、uncertainties[]。这些字段只记录本品选定语言；正向执行描述不能混入不采用的参考观察。do_not_copy排除与本品不符的商品、标识、文案、未经证实的声明及逐像素照搬，不否定已明确选定的构图关系、背景形态或装饰语言。报告不带图片路径、image URL/base64、source_images；图像归档在 inputs.json，设计报告只存语言。

`style` 输出不可变全局锁的计算 ID，策划的 global_style_lock_id 必须完全一致。改变 style-analysis 后要重新取得 ID 并检查六图策划。
creative_summary依据参考意图与本品适配，简明覆盖选定气质、配色、字体、光影和空间。国内摘要说明选定层次关系，具体布局留在逐图字段；亚马逊摘要不固定每格背景、色彩面积、标题位置或光源坐标。国内执行稿传摘要、transferable、visual_system与精简do_not_copy，set_rules用于分析检查；亚马逊沿用摘要及transferable/set_rules/do_not_copy。不要把国内关键执行要求只放在set_rules或七层观察。reference_intent.basis进入确认预览，全局锁保留分析，变更使旧确认失效。
商品真实性与已确认平台角色优先。亚马逊白底首图是风格例外；国内白底格按实际编号例外，不强制首图白底。

## V1.2：提取规律，不锁定模板

详细字段中的 angle、alignment、direction、area_ratios 等是观察，不自动变成六格固定坐标。亚马逊保持原有风格共享规则；国内整体参考时，选定的背景形态、材质、密度和层次也属于共享风格，不因“六图有区别”而删掉。用机位、景别、动势及信息分布形成变化，保留已选视觉特征；白底和已确认特殊场景是例外。标题位置、换行与光源方向可按本格调整。有图无需另选风格；所有任务仍展示完整方案并等用户单独回复“确认生成”。

无参考图的creative_summary依据第二环节已确认或明确委托的方向说明背景／环境、配色、字体和光影，不能声称来自参考观察，也不能把提出建议当成已经选定；商品原色不变。亚马逊首图白底、后五格承接风格；国内按已确认白底格与营销角色执行。允许一致标题区域，重点是移动端可读与信息不重复。
