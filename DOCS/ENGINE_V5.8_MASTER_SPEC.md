# WebGL Parallax Base Engine：核心架构与全能技术手册 (Release_v5.8)

> **定位**：本文档为 WebGL 视差引擎的“底座 (Base)”级技术指南。它不仅记录了 V5.8 的升级，更定义了整个引擎的运行公约、素材标准、底层算法及视觉排版规范。

---

## 壹：环境与底座公约 (Environment & Base)

### 🚨 运行环境准则 (Essential)

* **禁止双击本地打开**：因浏览器 CORS 安全限制，必须通过服务器环境（如 Live Server）运行。

### 2. 交互保护准则 (Interaction Protection)

为确保引擎具有原生 App 级的操作质感，必须在全局 CSS 中强制执行：

* **全局防划选 (`user-select: none`)**：严禁在 UI 元素、文字、图标上产生系统蓝色高亮。
* **全局防拖拽 (`-webkit-user-drag: none`)**：严禁对 `logo.png`、`top.png` 及任何按钮进行物理拖拽位移。
* **光标规范**：交互件统一使用 `cursor: pointer`，非交互区使用 `cursor: default`。

### 1. 资产文件全清单 (Asset Checklist)

* **物理层 (Physical Layers)**：
  * **`top.png` (必选)**：核心主体层，HTML `<img>` 挂载。
  * **`under.png` (可选)**：底层背景层。
  * **`cloud.png` / `cloud-12.png`**：环境云膜层。
* **光效层 (WebGL Textures)**：
  * **`light.png`**：白光驱动源。
  * **`color.png`**：彩光（镭射）驱动源。
  * **云膜强制回退 (Fallback)**：若 `-c` 版本内缺失 `cloud.png`，引擎将强制调用根目录的 `cloud-12.png` 补位。

### 3. 自动化探测与版本逻辑 (Auto-Discovery Logic)

引擎具备高度智能的资产自识别能力，无需手动配置版本列表：

* **盲测机制 (Blind Probe)**：引擎启动时会并行探测 `v1` 至 `v15` 文件夹。
* **变体优先级 (Variant Priority)**：对于相同序号，探测优先级为：**`v{n}-c` (场景版) > `v{n}` (主体版)**。若 `v1-c` 存在，则自动忽略 `v1`。
* **实时挂载 (Real-time Mounting)**：探测采用非阻塞模式，发现一个版本即在 HUD 上渲染一个按钮，无需等待所有探测结束。
* **默认状态**：若未指定，引擎默认加载第一个探测到的合法版本。

---

## 贰：核心算法与视觉系统 (Core Tech)

### 1. 光效视觉系统 (WebGL Light Logic)

引擎实现了两套独立且并行的光效渲染通道：

* **动态扫光动力学：高度图驱动流光 vs 线性扫描 (Luma Flow vs Linear Sweep)**：
  * **⚠️ 禁用项：线性扫描 (Linear Sweep / Planar Scanning)**：严禁直接使用 `v_uv.x` 坐标驱动进度。这种方式忽略了物体的几何结构，表现为机械、呆板的左往右横扫，即俗称的“塑料扫光”。
  * **✅ 核心准则：亮度/高度图驱动流光 (Luma-driven Flow / Surface-aware Lighting)**：必须使用素材的 **Red 通道 (1-254 灰度值)** 作为时间相位。
  * **视觉效果**：光线能够“感知”到物体的几何结构，根据灰度定义的起伏先后亮起，呈现出顺着轮廓“有机流淌”的高级质感。
* **复现级 GLSL 核心代码**：

```glsl
// 正确做法：读取红通道作为高度 H
float h = texture2D(u_tex_light, uv).r; 

// 利用 H 模拟高度位移，实现表面感知的流光 (Surface-aware)
float movePhase = fract(h - u_time); 
float d = abs(movePhase - 0.5);
```

* **视觉标准 (Quality Standard)**：光效严禁有硬边缘。如果光效看起来像一根垂直线在移动，说明错误地使用了“线性扫描”；必须呈现出随材质轮廓波动的形态。
* **双模式机制与质感叠加**：
  * **白光模式 (White Mode)**：读取 `light.png`。通过 `smoothstep` 构建 **“亮核 (Core)”+“光晕 (Bloom)”** 双层结构。核心极窄极亮，光晕柔和外溢，模拟真实物理光感。
  * **彩光模式 (Rainbow Mode)**：读取 `color.png`。采用 `color_rainbow` 算法。
    * **色相倍速逻辑**：彩虹颜色的流动频率（2.0x）设定为扫描频率（1.0x）的两倍，产生灵动的镭射位移效果。
// 叠加算法 (Superposition) 与亮度保护 (Brightness Mask)
// 核心：光效强度必须乘以 (hL 或 hC) 以确保在素材全透明或无图案区域绝对黑暗
vec3 finalL = haloL *0.7;
vec3 finalC = haloC* 1.0;
vec3 combinedHalo = (finalL + finalC) *u_bright* 2.8;
  * **光效物理模拟参数 (Physics Parameters for Reproduction)**：
    * **扫描线结构 (Scanline)**：
      * **核心 (Core)**：`smoothstep(0.1, 0.0, distance)`，指数系数 `1.5`（决定扫描线的锋利程度）。
      * **光晕 (Bloom)**：`smoothstep(0.25, 0.0, distance)`，强度系数 `0.4`（决定辉光的厚度）。
    * **混合权重 (Blending)**：
      * `combinedHalo = (White * 0.7 + Color * 1.0) * brightness * 2.8`（设定了白光为辅、彩光为主的工业基调）。
      * **最终补偿**：使用 `(1.0 - exp(-combinedHalo)) * 1.1` 进行曝光校正（1.1 为饱和度增益，防止颜色因 Tone Mapping 过于平淡）。
    * **镭射变频 (Rainbow Logic)**：
      * 高度偏移系数：`1.5`。
      * 时间频率系数：`2.0`（确保颜色变换快于物理位移，产生炫光感）。
  * **曝光映射 (Tone Mapping)**：使用 `1.0 - exp(-x)` 公式，彻底杜绝爆白全闪。
* **物理层叠加 (Natural Overlay)**：
  * **混合模式**：WebGL Canvas 必须设置 `mix-blend-mode: screen;`，并强制添加 `pointer-events: none;` 以防止阻挡下层交互。
* **位置同步 (Parallax Sync)**：Canvas 必须与 `top.png` 共享完全一致的视差 `transform` 逻辑。**严禁出现位移差**，否则光效会产生脱离主体的“漂浮感”。
* **50% 锐度适配 (High-DPI Scaling)**：
  * **核心逻辑**：若素材为 2x 高清图，容器尺寸应设定为 `naturalWidth * 0.5`。
  * **目的**：利用浏览器的缩放算法锁定锐度，防止在 Retina 屏幕上出现“发虚”现象。
* **分辨率自适配 (Auto-Fitting)**：
  * **核心逻辑**：引擎启动时必须读取 `top.png` 的 `naturalWidth` 和 `naturalHeight`，并实时同步给 `#stage` 容器。
  * **目的**：确保视差容器与主体素材 1:1 像素对齐，防止因拉伸导致的 WebGL 采样偏差。

### 2. 核心视差算法 (Parallax Logic)

* **计算公式 (Core Math)**：
  * **深度比例 (Depth Scale)**：`depthScale = STATE.arraySize / 8.0`（以 8mm 工业规格为 1.0 基准）。
  * **主体视差 (Subject Parallax)**：`tx = -nx * 0.032 * 100 * 22 * depthScale`。
  * **阵列范围**：强制锁定在 **6.0mm - 12.0mm**，防止物理透视穿帮。

```javascript
// 阵列尺寸对位移的全局缩放
const depthScale = (STATE.arraySize / 8.0); 
const tx = STATE.parallax.x * offsetScale;
const ty = STATE.parallax.y * offsetScale;

// SCENE 模式下的云膜联动
if (STATE.hasCloud) {
// 1. 云膜位移 (Cloud Shift)
const x = -nx * 0.032 * 100 * 22 * depthScale;
const y = -ny * 0.032 * 100 * 22 * depthScale;
layerClouds.style.transform = `translate(${x}px, ${y}px) scale(${depthScale * 1.2})`;

// 2. 动态景深算法 (Dynamic Depth of Field)
const intensity = Math.sqrt(nx * nx + ny * ny); // 倾斜强度
const limit = (STATE.arraySize / 12) * 3.0;     // 动态阈值范围
const threshold = limit * 0.3;                  // 起始门槛
let blurProgress = 0;
if (intensity > threshold) {
    blurProgress = (intensity - threshold) / (limit - threshold);
}
// 最大模糊上限随阵列尺寸线性增长 (基准 10.8px)
const maxBlur = (STATE.arraySize / 12) * 10.8; 
const dynamicBlur = blurProgress * maxBlur;
layerClouds.style.filter = dynamicBlur < 0.1 ? 'none' : `blur(${dynamicBlur.toFixed(1)}px)`;
```

* **FREE 模式锁定**：位移比率强制锁定为 `1.0` (对标 12mm)，Z 轴固定 `-50px`。

### 3. 交互平滑动力学 (Interaction Smoothing)

* **缓动系数 (Damping)**：

```javascript
// 核心：0.08 的缓动系数确保视察不生硬（对标 V5.6 物理参数）
currentX += (targetX - currentX) * 0.08;
currentY += (targetY - currentY) * 0.08;
```

* **自动复位逻辑 (Auto-Reset)**：
  * **触发条件**：当鼠标离开 (`mouseleave`) 或停止交互 (`mouseup`) 时，目标值 `targetX/Y` 强制清零。
  * **视觉效果**：由于缓动系数的存在，主体不会瞬间归位，而是产生一种带有物理惯性的“丝滑回弹”感。
* **边界保护**：倾斜量必须限制在 `[-1.0, 1.0]` 区间，防止 WebGL 纹理拉伸导致边缘黑洞。

### 4. 环境光影补偿 (Ambient Light Dynamics)

* **动态环境光 (Core CSS)**：
  * **实现方式**：在底座 (`#stage`) 上使用 `::after` 伪元素，挂载随鼠标位移的 `radial-gradient`。
  * **变量绑定**：使用 CSS 变量 `--after-x` 和 `--after-y` 与视差偏移量同步。

    ```css
    .stage::after {
        background: radial-gradient(
            circle at calc(35% + var(--after-x)) calc(25% + var(--after-y)),
            rgba(255, 255, 255, 0.08) 0%,
            transparent 60%
        );
        mix-blend-mode: screen;
    }
    ```

* **视觉目的**：模拟真实物理环境中，物体倾斜时背景反光产生的微弱偏移。即便主体投影是静态的，这种背景光的位移也能产生强烈的“空间深度”假象。

---

## 叁：色彩控制系统 (Color Control System)

### 1. 引擎取色逻辑 (State Sync)

* **双向同步与纠错 (Core JS)**：

```javascript
hexInput.oninput = (e) => {
    let val = e.target.value.trim();
    if (val.length === 6 && !val.startsWith('#')) val = '#' + val; // 自动补全
    if (/^#[0-9A-F]{6}$/i.test(val)) {
        updateStageColor(val); // 核心：只有合法的 Hex 才会触发背景更新
    }
};
```

* **智能输入规范**：使用正则表达式 `^#[0-9A-F]{6}$` 进行安全拦截，防止非法字符导致渲染器崩溃。

### 2. 资产驱动的 UI 联动 (Dynamic Visibility)

* **逻辑自检**：引擎启动后执行 300ms 非阻塞扫描。
* **条件显示规则**：
  * 若 `light.png` 与 `color.png` 均不存在：**自动隐藏**“亮度”与“光速”滑块卡片。
  * 若 `cloud.png` 不存在：**自动隐藏**云膜层并锁定相关物理参数。
* **意义**：确保 UI 的简洁性，实现“所见即所调”，杜绝功能空转。

### 3. 绿幕模式逻辑 (Green Screen Mode)

* **组件形式**：侧边栏中的复选框 (`#green-screen-toggle`)。
* **一键切换**：勾选时，系统强制将 `STATE.bgColor` 设为 `#00FF00`。
* **状态同步**：背景颜色、Hex 输入框、取色盘指标必须同步变绿。

---

## 肆：交互系统与视觉排版 (UI & Interaction)

### 1. 按钮与动态效果 (UI Animation)

* **状态反馈 (Core CSS)**：

```css
.v-btn.active {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
    animation: v-pulse 2.5s ease-in-out infinite; /* 蓝光呼吸 */
}

@keyframes v-pulse {
    0% { box-shadow: inset 0 0 10px rgba(59, 130, 246, 0.1); }
    50% { box-shadow: inset 0 0 20px rgba(59, 130, 246, 0.3); }
    100% { box-shadow: inset 0 0 10px rgba(59, 130, 246, 0.1); }
}

/* 极致边框流光 (Aurora Sweep) */
.v-btn.active::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 100px;
    border: 1px solid transparent;
    background: linear-gradient(90deg, transparent, transparent, #3b82f6, transparent, transparent) border-box;
    -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;
    background-size: 200% 100%;
    animation: aurora-sweep 3s linear infinite;
}

@keyframes aurora-sweep {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}
```

* **预览模式切换**：通过 `document.body.classList.toggle('is-preview')` 全局控制。

### 2. 结构与布局蓝图 (Mechanical Assembly)

* **CSS 核心：机械式咬合 (Core CSS)**：

```css
.demo-hud {
    display: flex;
    flex-direction: column;
    align-items: stretch; /* 强制所有子项横向齐平对齐 */
    width: 95vw;
    max-width: 550px;
}
.hud-card.mini, .v-btn {
    flex: 1; /* 均分布局，禁止药丸状独立悬浮 */
    margin: 0; 
}
```

* **核心约束**：严禁在子元素中使用固定像素宽度。所有组件必须实现“边缘咬合”，禁止出现视觉缝隙。

### 3. 全局显示模式控制 (Global Mode Control)

* **预览模式 (Preview Mode)**：
  * **控制入口**：底部主按钮 `#btn-preview`（文案：“进入预览模式”）。
  * **控制机制**：通过 `document.body.classList.toggle('is-preview')` 实现。
  * **视觉效果**：当 `is-preview` 激活时，侧边栏 `#main-sidebar` 执行 `opacity: 0` 且 `pointer-events: none`；同时显示精简版 `#preview-hud`。
* **逃生键绑定 (ESC Key Binding)**：

    ```javascript
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') togglePreviewMode(); // 强制性全局退出/进入快捷键
    });
    ```

### 3. 背景系统与层级 (Background System)

* **多层级背景公约**：
  * **Stage 层**：动态可调色背景，支持实时取色联动。
  * **Grid 网格层**：浮动覆盖层，提供工业科技感的参考坐标系。
  * **Under 静态层**：Z-Index 位于最低端，随视差产生轻微位移。
* **渲染层级总结 (Z-Index Hierarchy)**：
    `Stage背景` -> `Grid网格` -> `Under背景` (Z: -20px) -> `Clouds云膜` (Z: -15px) -> `Subject主体 (top.png)` (Z: 0px) -> `WebGL光效 (Canvas)` (Z: 5px, **Mix-Blend: Screen**)。

### 4. 页面环境约束 (Global Env)

* **强制 CSS 约束**：

    ```css
    body, html { height: 100vh; overflow: hidden; margin: 0; }
    #stage { width: 100%; height: 100%; position: relative; }
    ```

* **禁止项**：禁止任何形式的页面滚动，确保内容视觉重心锁定。
* **3D 透视深度 (Perspective)**：
  * **核心配置**：父级容器必须设置 `perspective: 1000px;`。
  * **视觉影响**：若缺失此项，主体的 `rotateX/Y` 将失去纵深感，表现为扁平的梯形畸变而非真实的 3D 旋转。

---

## 伍：性能与品牌规范 (Performance & Branding)

### 1. 加载性能 (Optimization)

* **非阻塞渲染**：`top.png` 主体图像先行呈现，版本扫描（Scanning）在后台并行，探测超时严格限制在 300ms 以内。
* **增量渲染**：版本按钮“发现即显示”，消除启动时的白屏等待感。
* **版本软切换 (Soft-Transition)**：
  * **清理机制**：在加载新版本素材前，必须先调用 `clearTexture` 清空当前的 WebGL 纹理单元，防止“前朝图像”残留导致的闪烁。
  * **状态锁定**：在加载期间，UI 必须锁定在 `SCANNING...` 状态，并对当前主体层执行微弱的渐隐效果。

### 2. 品牌与视觉识别 (Branding)

* **加载占位**：在探测资产期间，UI 必须挂载 `.is-scanning` 类。Logo 保持渐隐渐现的加载态，并禁用所有交互。
* **主体防闪烁 (Anti-Flicker)**：在 `top.png` 切换瞬间，必须通过 CSS 给主体添加一个微弱的 `grayscale(1)` 或 `opacity: 0.5` 的过渡，防止生硬的贴图跳变。

---

## 陆：深度复盘与错误梳理 (Reflection)

### 🚨 核心反思：防止“底座结构破坏”

回顾开发历程，我们曾多次陷入“小熊掰玉米”的陷阱：

1. **资产角色混淆**：曾混淆 `top.png` 与 WebGL 渲染层的关系，现已明确物理层与光效层的分工。
2. **功能倒退**：误删速率控制、取色器逻辑。
3. **对齐假象**：试图用固定像素对齐 UI。

### ✅ 维护技术要点 (Maintenance Essentials)

* **素材规范**：`top.png` 必须高清；流光驱动素材必须以 **Red 通道** 存储灰度梯度。
* **环境准则**：黑屏首检 CORS。禁止在本地 `file://` 协议下运行。
* **非标自检**：若发现滑块消失，优先检查对应版本的 `light.png` 或 `color.png` 是否漏传。

---

## 柒：视觉验收清单 (Visual Audit Checklist)

*即便不看代码，只要以下任一选项为“否”，即判定为“非标/廉价”实现：*

### 1. 扫光自检 (Light Check)

* [ ] **流淌感**：光效是否顺着瓶身/材质的起伏亮起？（若是死板的垂直线平移，则判定为错误）。
* [ ] **呼吸感**：白光模式是否有柔和的光晕（Bloom）外溢？核心是否足够锋利？
* [ ] **防爆性**：切换到彩光并调大亮度，屏幕是否会瞬间变全白？（若会，说明缺少 Tone Mapping 公式）。

### 2. 交互手感 (Tactile Check)

* [ ] **回弹感**：鼠标松开后，主体是否平滑地滑回中心？（若是瞬间跳回，说明缺少 Damping 缓动）。
* [ ] **静态保护**：尝试用鼠标划选文字或拖拽 Logo，是否能被选中或拖动？（若能，说明交互保护失效）。

### 3. UI 结构 (Structure Check)

* [ ] **机械咬合**：按钮之间是否有缝隙？按钮是否是独立的“药丸”？（若是，判定为破坏机械美学）。
* [ ] **通电感**：当前激活的版本按钮是否有微弱的“蓝光呼吸”和“边框流光”？（若只有静态色块，判定为灵魂缺失）。

---
*Base Engine Version 5.8 | TechSun Standards*
*Compiled by Antigravity AI*
