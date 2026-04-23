/**
 * TechSun Visual Engine v3.7
 * WebGL + Multi-layer Parallax
 */

const CONFIG = {
    tiltStrength: 0.04,    // 更加稳重的倾斜感
    parallaxStrength: 0.25, // 增强 3D 纵深
    zoomMin: 0.8,          
    zoomMax: 1.2,          
    cloudAssetRatio: 3.0    
};

const STATE = {
    version: 'v1',
    brightness: 1.0,
    speed: 1.0,
    bgColor: '#000000',
    defaultGreen: false,
    arraySize: 8,
    calibrationScale: 1.5,
    designRatio: 3.0,
    zoom: 1.0,
    targetZoom: 1.0,
    versions: ['v1', 'v2', 'v3', 'v4', 'v5'],
    parallax: { x: 0, y: 0, targetX: 0, targetY: 0, friction: 0.08 },
    ...window.PRESET_DATA
};

// UI Elements
const glCanvas = document.getElementById('glCanvas');
const topImg = document.getElementById('topImg');
const layerUnder = document.getElementById('layer-under');
const layerClouds = document.getElementById('layer-clouds');
const versionList = document.getElementById('version-list');

/* ── WebGL Shader ── */
const VS_SRC = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
    }
`;

const FS_SRC = `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_tex_light;
    uniform sampler2D u_tex_color;
    uniform float u_time;
    uniform float u_bright;
    uniform float u_tol;


        vec3 color_rainbow(float t) {
        vec3 c = vec3(0.5);
        vec3 d = vec3(0.5);
        vec3 e = vec3(1.0);
        vec3 f = vec3(0.0, 0.33, 0.67);
        return c + d * cos(6.28318 * (e * t + f));
    }

    void main() {
        vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
        vec4 tL = texture2D(u_tex_light, uv);
        vec4 tC = texture2D(u_tex_color, uv);
        
        float aL = tL.a;
        float aC = tC.a;

        float hL = tL.r;
        float hC = tC.r;

        // White Light
        vec3 haloL = vec3(0.0);
        float pulseL = 0.0;
        if (aL > 0.0) {
            float movePhaseL = fract(hL - u_time);
            float dL = abs(movePhaseL - 0.5);
            float coreL = pow(smoothstep(0.1, 0.0, dL), 1.5);
            float bloomL = smoothstep(0.25, 0.0, dL) * 0.4;
            // 核心修复：乘以 hL，确保光只在有亮度的地方出现，解决黑/绿背景溢出问题
            pulseL = (coreL + bloomL) * hL; 
            haloL = vec3(1.0) * pulseL;
        }

        // Color Light
        vec3 haloC = vec3(0.0);
        float pulseC = 0.0;
        if (aC > 0.0) {
            float movePhaseC = fract(hC - u_time);
            float dC = abs(movePhaseC - 0.5);
            float coreC = pow(smoothstep(0.1, 0.0, dC), 1.5);
            float bloomC = smoothstep(0.25, 0.0, dC) * 0.4;
            // 核心修复：乘以 hC
            pulseC = (coreC + bloomC) * hC;
            
            vec3 rainbow = color_rainbow(fract(hC * 1.5 + u_time * 2.0));
            float rLum = dot(rainbow, vec3(0.299, 0.587, 0.114));
            haloC = mix(vec3(rLum), rainbow, 0.7) * pulseC;
        }

        float totalPulse = min(1.0, pulseL + pulseC);
        float maxH = max(aL > 0.0 ? hL : 0.0, aC > 0.0 ? hC : 0.0);
        vec3 baseGlow = vec3(maxH * maxH * 0.8) * totalPulse;

        // 精准渲染：引入非线性曝光映射，保护 1-254 灰度细节
        // 为确保亮度和质感平衡，我们将亮度因子扩充并进行软剪裁
        vec3 combinedHalo = (haloL + haloC) * u_bright * 3.5;
        
        // 使用 1.0 - exp(-x) 映射，确保核心不破色，边缘有层次
        vec3 finalGlow = baseGlow + (vec3(1.0) - exp(-combinedHalo)) * 1.1;

        // 获取混合后叠加的透度，基于酒标形状遮罩 (aL, aC) 进行输出
        float lum = dot(finalGlow, vec3(0.299, 0.587, 0.114));
        float outAlpha = min(1.0, lum * 1.2) * max(aL, aC);

        gl_FragColor = vec4(finalGlow, outAlpha);
    }
`;

/* ── WebGL Controller ── */
let gl, prog, uLocs = {};
let texLight, texColor;
let texLightReady = false, texColorReady = false;

function initGL() {
    gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VS_SRC);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, FS_SRC);
    gl.compileShader(fs);

    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uLocs = {
        time: gl.getUniformLocation(prog, 'u_time'),
        bright: gl.getUniformLocation(prog, 'u_bright'),
        tol: gl.getUniformLocation(prog, 'u_tol'),
        texLight: gl.getUniformLocation(prog, 'u_tex_light'),
        texColor: gl.getUniformLocation(prog, 'u_tex_color')
    };

    gl.uniform1i(uLocs.texLight, 0);
    gl.uniform1i(uLocs.texColor, 1);

    texLight = createTexture(0);
    texColor = createTexture(1);
}

function createTexture(unit) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
}

function updateTexture(tex, img, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
}

// 核心工具：创建 1x1 透明纹理，用于资产缺失时清空 Canvas
function updateTextureEmpty(tex, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const empty = new Uint8Array([0, 0, 0, 0]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, empty);
}

/* ── Asset Loader ── */
async function loadVersion(v) {
    STATE.version = v;
    const path = `./${v}/`;

    if (STATE.defaultGreen) updateBG('#00FF2A');

    // 定义加载任务池
    const loadTasks = [];

    // 1. 顶层主体图片
    const topTask = new Promise(resolve => {
        topImg.onload = () => {
            const stage = document.getElementById('stage');
            if (stage && topImg.naturalWidth > 0) {
                // 物理锁定：直接使用图片原始尺寸
                stage.style.width = topImg.naturalWidth + 'px';
                stage.style.height = topImg.naturalHeight + 'px';
            }
            syncCanvasSize();
            resolve();
        };
        topImg.onerror = resolve;
        topImg.src = `${path}top.png`;
    });
    loadTasks.push(topTask);

    // 2. 底图加载
    const underTask = new Promise(resolve => {
        const p = new Image();
        p.onload = () => {
            layerUnder.style.backgroundImage = `url(${path}under.png)`;
            layerUnder.style.opacity = '1';
            resolve();
        };
        p.onerror = () => {
            layerUnder.style.backgroundImage = 'none';
            layerUnder.style.opacity = '0';
            resolve();
        };
        p.src = `${path}under.png`;
    });
    loadTasks.push(underTask);

    // 3. WebGL 光效
    texLightReady = false;
    texColorReady = false;
    const lightTask = new Promise(resolve => {
        const imgL = new Image();
        imgL.onload = () => { updateTexture(texLight, imgL, 0); texLightReady = true; resolve(); };
        imgL.onerror = () => { updateTextureEmpty(texLight, 0); texLightReady = true; resolve(); };
        imgL.src = `${path}light.png`;
    });
    const colorTask = new Promise(resolve => {
        const imgC = new Image();
        imgC.onload = () => { updateTexture(texColor, imgC, 1); texColorReady = true; resolve(); };
        imgC.onerror = () => { updateTextureEmpty(texColor, 1); texColorReady = true; resolve(); };
        imgC.src = `${path}color light.png`;
    });
    loadTasks.push(lightTask, colorTask);

    // 4. 云膜加载
    const cloudTask = new Promise(resolve => {
        layerClouds.innerHTML = '';
        const cImg = new Image();
        cImg.className = 'cloud-item';
        cImg.onload = () => {
            if (topImg.naturalWidth > 0) cImg.dataset.ratio = cImg.naturalWidth / topImg.naturalWidth;
            else cImg.dataset.ratio = 3.0;
            if (!cImg.parentNode) layerClouds.appendChild(cImg);
            resolve();
        };
        cImg.onerror = () => {
            cImg.src = `./cloud-12.png`; // 兜底
            resolve();
        };
        cImg.src = `${path}cloud-12.png`;
    });
    loadTasks.push(cloudTask);

    // ── 终极揭幕：所有资产就绪 ──
    await Promise.all(loadTasks);
    document.body.classList.add('is-ready');
    
    // 同步侧边栏按钮状态
    document.querySelectorAll('.v-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === v);
    });
}

function syncCanvasSize() {
    if (!topImg || !gl) return;
    const r = topImg.getBoundingClientRect();
    glCanvas.width = r.width;
    glCanvas.height = r.height;
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
}

function initParallax() {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let baseTargetX = 0;
    let baseTargetY = 0;

    const onStart = (e) => {
        isDragging = true;
        const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
        const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
        startX = cx;
        startY = cy;
        baseTargetX = STATE.parallax.targetX;
        baseTargetY = STATE.parallax.targetY;
        document.body.style.cursor = 'grabbing';
    };

    const onMove = (e) => {
        if (!isDragging) return;
        const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
        const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

        const dx = cx - startX;
        const dy = cy - startY;

        const arraySize = STATE.arraySize || 8.0;
        const currentCloudScale = (arraySize / 12.0) * CONFIG.cloudAssetRatio;
        
        // 动态计算安全限幅：确保位移永远不会超出云膜边界 (基于 3x 资产标准)
        const stageHeight = topImg ? topImg.offsetHeight : 800;
        const safeLimit = Math.max(80, (stageHeight * currentCloudScale - stageHeight) * 0.45);
        
        const tx = baseTargetX - dx * 0.2;
        const ty = baseTargetY - dy * 0.2;
        
        STATE.parallax.targetX = Math.max(-safeLimit, Math.min(safeLimit, tx));
        STATE.parallax.targetY = Math.max(-safeLimit, Math.min(safeLimit, ty));
    };

    const onEnd = () => {
        isDragging = false;
        document.body.style.cursor = 'default';

        // 自动回归中心：松手后将目标点设回原点，利用惯性系统平滑回归
        STATE.parallax.targetX = 0;
        STATE.parallax.targetY = 0;
    };

    window.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) onStart(e);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            onMove(e);
        }
    }, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('mouseleave', onEnd);
}

function updateParallax() {
    STATE.parallax.x += (STATE.parallax.targetX - STATE.parallax.x) * STATE.parallax.friction;
    STATE.parallax.y += (STATE.parallax.targetY - STATE.parallax.y) * STATE.parallax.friction;

    const px = STATE.parallax.x;
    const py = STATE.parallax.y;

    // 缩放限幅与惯性插值
    STATE.targetZoom = Math.max(CONFIG.zoomMin, Math.min(CONFIG.zoomMax, STATE.targetZoom));
    STATE.zoom += (STATE.targetZoom - STATE.zoom) * 0.12;

    const stage = document.getElementById('stage');
    if (stage) {
        const rotX = -py * CONFIG.tiltStrength; 
        const rotY = px * CONFIG.tiltStrength;  
        stage.style.transform = `scale(${STATE.zoom}) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    }

    const lightOverlay = document.querySelector('.lighting-overlay');
    if (lightOverlay) {
        // 让光影随动更自然，减少过曝感
        const lx = -px * 0.2;
        const ly = -py * 0.2;
        lightOverlay.style.transform = `translate(${lx}px, ${ly}px)`;
        lightOverlay.style.opacity = 0.6; // 柔和化处理
    }

    // 云膜层视差 (自动化对位模式)
    const cloudImg = document.getElementById('cloudImg');
    if (cloudImg) {
        const arraySize = STATE.arraySize || 8.0;
        // 严格按照 arraySize / 12mm 物理对位
        const currentScale = (arraySize / 12.0); 
        const cloudFactor = arraySize * CONFIG.parallaxStrength; 
        
        cloudImg.style.transform = `translate(-50%, -50%) translate(${px * cloudFactor}px, ${py * cloudFactor}px) scale(${currentScale})`;
    }
}

let lastT = 0;
let timeAccum = 0;
const BASE_PERIOD = 2.8;

function loop(t) {
    const dt = (t - lastT) * 0.001;
    lastT = t;

    const currentPeriod = BASE_PERIOD / (STATE.speed || 1.0);
    timeAccum = (timeAccum + dt) % currentPeriod;
    const timeVal = timeAccum / currentPeriod;

    if (texLightReady && texColorReady && gl) {
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Ensure textures are still bound to their respective units
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texLight);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texColor);

        gl.uniform1f(uLocs.time, timeVal);
        gl.uniform1f(uLocs.bright, STATE.brightness);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    updateParallax();
    requestAnimationFrame(loop);
}

const updateBG = (color) => {
    const bgPicker = document.getElementById('bg-color-picker');
    const bgHex = document.getElementById('bg-color-hex');
    const bgIndicator = document.getElementById('bg-color-indicator');
    const stage = document.getElementById('stage');

    STATE.bgColor = color;
    document.documentElement.style.setProperty('--stage-bg', color); // 同步更新 CSS 变量
    if (stage) stage.style.backgroundColor = color;
    if (bgIndicator) bgIndicator.style.backgroundColor = color;
    if (bgHex) bgHex.value = color.toUpperCase();
    if (bgPicker) bgPicker.value = color;
};

function initUI() {
    // --- 编辑器专属逻辑 ---
    document.getElementById('bg-color-picker').oninput = (e) => updateBG(e.target.value);
    document.getElementById('bg-color-hex').onchange = (e) => {
        let val = e.target.value;
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9A-F]{6}$/i.test(val)) updateBG(val);
    };
    document.getElementById('bg-default-green').onchange = (e) => {
        STATE.defaultGreen = e.target.checked;
        if (STATE.defaultGreen) updateBG('#00FF2A');
    };

    // 侧边栏版本按钮
    STATE.versions.forEach(v => {
        const btn = document.createElement('button');
        btn.className = 'v-btn';
        btn.textContent = v.toUpperCase();
        btn.onclick = () => {
            setVersion(v);
            // 补全高亮逻辑
            document.querySelectorAll('.hud-v-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
        versionList.appendChild(btn);
    });

    // --- 通用同步逻辑 ---
    const syncValue = (key, val, sliderIds, valIds) => {
        STATE[key] = val;
        sliderIds.forEach(id => { const s = document.getElementById(id); if (s) s.value = val; });
        valIds.forEach(id => {
            const v = document.getElementById(id);
            if (v) v.textContent = (key === 'arraySize' ? val + 'mm' : val.toFixed(1) + 'x');
        });
    };

    const dS = ['depth-slider', 'hud-depth-slider'];
    const dV = ['depth-val', 'hud-depth-val'];
    const bS = ['bright-slider', 'hud-bright-slider'];
    const bV = ['bright-val', 'hud-bright-val'];
    const sS = ['speed-slider', 'hud-speed-slider'];
    const sV = ['speed-val', 'hud-speed-val'];

    // 绑定所有滑块
    [...dS, ...bS, ...sS].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.oninput = (e) => {
            const val = parseFloat(e.target.value);
            if (id.includes('depth')) syncValue('arraySize', val, dS, dV);
            else if (id.includes('bright')) syncValue('brightness', val, bS, bV);
            else if (id.includes('speed')) syncValue('speed', val, sS, sV);
        };
    });

    // 动态同步 HUD 数值与显隐
    const syncHUD = () => {
        const depthCard = document.querySelector('.hud-card:nth-child(1)');  // 1: 阵列尺寸
        const brightCard = document.querySelector('.hud-card:nth-child(2)'); // 2: 光效透明度
        const speedCard = document.querySelector('.hud-card:nth-child(3)');  // 3: 动画速率
        const hudVersionList = document.getElementById('hud-version-list');
        
        // 自愈逻辑：如果版本列表空了，立即补全
        if (hudVersionList && hudVersionList.children.length === 0) {
            STATE.versions.forEach(v => {
                const btn = document.createElement('button');
                btn.className = 'hud-v-btn';
                btn.textContent = v.toUpperCase();
                btn.onclick = (e) => {
                    e.preventDefault();
                    loadVersion(v).then(() => syncHUD());
                };
                hudVersionList.appendChild(btn);
            });
        }
        
        // 实时更新高亮状态 (移到外面)
        if (hudVersionList) {
            document.querySelectorAll('.hud-v-btn').forEach(b => {
                b.classList.toggle('active', b.textContent.toLowerCase() === STATE.version);
            });
        }

        if (brightCard) {
            const hasLight = (texLightReady || texColorReady || STATE.version.toLowerCase().startsWith('v')); 
            brightCard.style.display = hasLight ? 'block' : 'none';
        }
        
        if (depthCard) {
            depthCard.style.display = document.body.classList.contains('is-client') ? 'none' : 'block';
        }

        if(document.getElementById('hud-depth-val')) document.getElementById('hud-depth-val').textContent = STATE.arraySize + 'mm';
        if(document.getElementById('hud-bright-val')) document.getElementById('hud-bright-val').textContent = STATE.brightness.toFixed(1) + 'x';
        if(document.getElementById('hud-speed-val')) document.getElementById('hud-speed-val').textContent = STATE.speed.toFixed(1) + 'x';
    };

    // 初始化同步
    syncValue('arraySize', STATE.arraySize, dS, dV);
    syncValue('brightness', STATE.brightness, bS, bV);
    syncValue('speed', STATE.speed, sS, sV);
    syncHUD();

    // 底部 HUD 版本按钮 (高端分段式生成)
    const hudVersionList = document.getElementById('hud-version-list');
    if (hudVersionList) {
        hudVersionList.innerHTML = '';
        STATE.versions.forEach(v => {
            const btn = document.createElement('button');
            btn.className = 'hud-v-btn'; // 修正类名：同步 style.css 的装修方案
            if (v === STATE.version) btn.classList.add('active');
            btn.textContent = v.toUpperCase();
            

            btn.onclick = (e) => {
                e.preventDefault();
                loadVersion(v).then(() => {
                    syncHUD(); // 切换版本后动态检查光影
                });
                document.querySelectorAll('.v-btn, .hud-btn').forEach(b => {
                    b.classList.toggle('active', b.textContent.toLowerCase() === v);
                });
            };
            hudVersionList.appendChild(btn);
        });
    }

    // HUD 内部滑动条绑定
    const hDS = document.getElementById('hud-depth-slider');
    const hBS = document.getElementById('hud-bright-slider');
    const hSS = document.getElementById('hud-speed-slider');

    hDS.oninput = (e) => { 
        STATE.arraySize = parseInt(e.target.value);
        document.getElementById('depth-slider').value = STATE.arraySize; // 同步侧边栏
        syncHUD(); 
    };
    hBS.oninput = (e) => { 
        STATE.brightness = parseFloat(e.target.value);
        document.getElementById('bright-slider').value = STATE.brightness; // 同步侧边栏
        syncHUD(); 
    };
    hSS.oninput = (e) => { 
        STATE.speed = parseFloat(e.target.value);
        document.getElementById('speed-slider').value = STATE.speed; // 同步侧边栏
        syncHUD(); 
    };

    // 预览/调试/导出逻辑 (物理开关版)
    const sidebar = document.getElementById('main-sidebar');
    const hud = document.getElementById('preview-hud');
    const emergency = document.getElementById('emergency-exit');
    
    const setMode = (mode) => {
        if (mode === 'preview') {
            sidebar.style.display = 'none';
            hud.style.display = 'flex';
            emergency.style.display = 'flex';
            document.body.classList.add('is-preview');
            syncHUD();
        } else if (mode === 'debug') {
            sidebar.style.display = 'flex';
            hud.style.display = 'none';
            emergency.style.display = 'none';
            document.body.classList.remove('is-preview');
        } else if (mode === 'client') {
            sidebar.remove();
            hud.style.display = 'flex';
            emergency.remove();
            document.getElementById('btn-exit-preview').remove();
            document.body.classList.add('is-client', 'is-preview');
            syncHUD();
        }
    };

    document.getElementById('btn-preview').onclick = () => setMode('preview');
    
    const exitPreviewBtn = document.getElementById('btn-exit-preview');
    if (exitPreviewBtn) exitPreviewBtn.onclick = () => setMode('debug');
    
    if (emergency) {
        emergency.onclick = (e) => {
            e.preventDefault();
            setMode('debug');
        };
    }

    document.getElementById('btn-export').onclick = () => {
        const clone = document.documentElement.cloneNode(true);
        // 在克隆出的代码里执行一次物理清理
        clone.querySelector('#main-sidebar')?.remove();
        clone.querySelector('#emergency-exit')?.remove();
        clone.querySelector('#btn-exit-preview')?.remove();
        clone.querySelector('body').classList.add('is-client', 'is-preview');
        
        const html = '<!DOCTYPE html>\n' + clone.outerHTML;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TechSun_${STATE.version}_Client.html`;
        a.click();
    };

    // --- 实时预览切换逻辑 ---
    const previewBtn = document.getElementById('preview-toggle');
    if (previewBtn) {
        previewBtn.onclick = () => {
            const isDemo = document.body.classList.toggle('is-client');
            previewBtn.textContent = isDemo ? '🔙 编辑' : '👁️ 预览';
            // 切换时如果侧边栏是折叠的，最好展开或保持原样
        };
    }

    const toggleBtn = document.getElementById('panel-toggle');
    if (toggleBtn) toggleBtn.onclick = () => document.body.classList.toggle('is-folded');

    // --- 滚轮缩放监听 ---
    window.addEventListener('wheel', (e) => {
        // 如果在交互区域内，阻止默认滚动
        e.preventDefault();
        const delta = -Math.sign(e.deltaY) * 0.1;
        STATE.targetZoom = Math.max(0.6, Math.min(2.0, STATE.targetZoom + delta));
    }, { passive: false });
}

initGL();
initUI();
initParallax();
loadVersion('v1');
requestAnimationFrame(loop);
window.addEventListener('resize', syncCanvasSize);
document.addEventListener('contextmenu', e => e.preventDefault());
