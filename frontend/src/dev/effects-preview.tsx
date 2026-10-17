import { useEffect, useRef, useState } from 'react'
import { BorderBeam, type BorderBeamSize } from 'border-beam'
import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import { Liquid } from 'liquid-gooey'
import { MetalFx, type MetalFxPreset } from 'metal-fx'
import './effects-preview.css'
import '../components/effects/effects.css'
import { useCardCursorGlow } from '../components/effects/useCardCursorGlow'
import { beamThemeTuning, choose, EFFECT_STRENGTH, METAL_PRESETS, randomBeam } from '../components/effects/presets'

const orbStates: OrbState[] = ['working', 'searching', 'solving', 'listening', 'connecting', 'weaving', 'composing', 'breathing', 'shaping']
const orbLabels: Record<OrbState, string> = { working: '正在处理素材', searching: '正在查找素材', solving: '正在分析画面', listening: '等待你的输入', connecting: '正在建立连接', weaving: '正在整理关联', composing: '正在生成结果', breathing: '准备就绪', shaping: '正在优化结果' }

function useMotionPolicy() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [hidden, setHidden] = useState(() => document.hidden)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => setReduced(query.matches)
    const onVisibility = () => setHidden(document.hidden)
    query.addEventListener('change', onMotion)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { query.removeEventListener('change', onMotion); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  return { reduced, hidden }
}

export function EffectsPreview() {
  const cursorGlowRef = useCardCursorGlow<HTMLElement>()
  const [dark, setDark] = useState(true)
  const [paused, setPaused] = useState(false)
  const [simulateReduced, setSimulateReduced] = useState(false)
  const { reduced, hidden } = useMotionPolicy()
  const stop = paused || simulateReduced || reduced || hidden
  const theme = dark ? 'dark' : 'light'
  const beamTuning = beamThemeTuning(theme)
  const strength = EFFECT_STRENGTH
  const [initialBeam] = useState(randomBeam)
  const [beamSize, setBeamSize] = useState<BorderBeamSize>(initialBeam.size)
  const [orbState, setOrbState] = useState<OrbState>('solving')
  const [orbSize, setOrbSize] = useState<20 | 64>(64)
  const [preset, setPreset] = useState<MetalFxPreset>(() => choose(METAL_PRESETS))
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('点击材质，感受交互。')
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const closeMenu = () => { setOpen(false); menuTrigger.current?.focus() }
  const action = (name: string) => { setMessage(`${name} · 预览操作已触发`); closeMenu() }
  useEffect(() => { document.documentElement.dataset.theme = theme; return () => { delete document.documentElement.dataset.theme } }, [theme])

  return <main ref={cursorGlowRef} className="material-page" data-theme={theme} data-motion={stop ? 'paused' : 'running'}>
    <div className="material-shell">
      <header className="material-topbar">
        <a className="material-wordmark" href="#top" aria-label="LensFlow 交互预览首页"><span className="material-mark" aria-hidden="true">◉</span> LensFlow<span className="material-divider">/</span><span className="material-lab">INTERACTION LAB</span></a>
        <div className="material-header-actions"><span className="material-preview-label">DESIGN PREVIEW · 01</span><button className="material-icon-button" aria-label={dark ? '切换浅色主题' : '切换深色主题'} onClick={() => setDark(!dark)}>{dark ? '☼' : '☾'}</button></div>
      </header>

      <section className="material-hero" id="top">
        <div className="material-eyebrow"><span /> THE FEELING OF FLOW</div>
        <h1>让光，<br /><span>参与每一次交互。</span></h1>
        <div className="material-hero-bottom"><p>流动的边界，思考的形状，触手可及的质感。<br />为 LensFlow 探索一套更有感知的交互语言。</p><a className="material-text-link" href="#studies">探索四种材质 <span aria-hidden="true">↙</span></a></div>
        <div className="material-hero-index" aria-hidden="true">LF—04<br /><span>MATERIAL STUDIES</span></div>
      </section>

      <section className="material-toolbar" aria-label="预览控制">
        <div className="material-live"><i className={stop ? 'is-paused' : ''} />{stop ? '静态预览' : '实时渲染'}<span> / 四个真实组件库</span></div>
        <div className="material-switches"><label><input type="checkbox" checked={simulateReduced} onChange={e => setSimulateReduced(e.target.checked)} />减少动态效果</label><button className="material-small-button" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? '继续动效' : '暂停动效'} <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span></button></div>
      </section>
      {reduced && <p className="material-system-note">已遵循系统的减少动态效果设置。关闭系统偏好后可观看动效。</p>}

      <div className="material-studies" id="studies">
        <section className="material-study material-beam">
          <div className="material-study-heading"><div><span className="material-number">01 / BEAM</span><h2>光沿边界流动</h2></div><span className="material-tag">重点卡片</span></div>
          <div className="material-stage material-beam-stage">
            <div className="material-beam-wrap effects-surface effects-surface-beam" data-effect-theme={theme} data-beam-size={beamSize} data-beam-color="mono">
              <article className="material-album"><div className="material-album-top"><span className="material-aperture" aria-hidden="true">✳</span><span className="material-mini-label">CURATED COLLECTION</span><span aria-hidden="true">↗</span></div><div className="material-album-lines" aria-hidden="true"><i /><i /><i /><i /><i /></div><div className="material-album-bottom"><div><span className="material-mini-label">人像摄影 / VOL. 024</span><h3>光影之间</h3></div><span className="material-album-count">24<span>张精选</span></span></div></article>
              <div className="effects-surface-overlay" aria-hidden="true" inert><BorderBeam size={beamSize} colorVariant="mono" staticColors strength={strength} theme="dark" active={!stop} brightness={beamTuning.brightness} glowSize={beamTuning.glowSize} style={{width:'100%',height:'100%',...beamTuning.style}} borderRadius={22} className="effects-surface-renderer"><span className="effects-surface-shape" /></BorderBeam></div>
            </div>
          </div>
          <div className="material-controls material-controls-two"><label>光效形态<select value={beamSize} onChange={e => setBeamSize(e.target.value as BorderBeamSize)}>{['md','sm','line','pulse-inner','pulse-outside'].map(x => <option key={x}>{x}</option>)}</select></label><div className="material-fixed-strength">色彩<span>mono / 固定</span></div></div>
          <p className="material-caption">引导注意力，让重要内容自然浮现。</p>
        </section>

        <section className="material-study material-orb">
          <div className="material-study-heading"><div><span className="material-number">02 / ORB</span><h2>看得见的思考</h2></div><span className="material-tag">AI 状态</span></div>
          <div className="material-stage material-orb-stage"><div className="material-orbit-guide" aria-hidden="true" /><div className="material-orb-object" aria-hidden="true"><ThinkingOrb state={orbState} size={orbSize} theme={theme} speed={1} paused={stop} /></div><p className="material-orb-message">{orbLabels[orbState]}<span>LensFlow Intelligence · 模拟状态</span></p><div className="material-stage-coordinates" aria-hidden="true">AI / {orbState.toUpperCase()}<span>{orbSize} × {orbSize}</span></div></div>
          <div className="material-controls material-controls-two"><label>思考状态<select value={orbState} onChange={e => setOrbState(e.target.value as OrbState)}>{orbStates.map(x => <option key={x} value={x}>{x}</option>)}</select></label><label>显示尺寸<select value={orbSize} onChange={e => setOrbSize(Number(e.target.value) as 20 | 64)}><option value={64}>64 · 状态展示</option><option value={20}>20 · 行内提示</option></select></label></div>
          <p className="material-caption">从机械等待，到有呼吸感的智能反馈。</p>
        </section>

        <section className="material-study material-gooey">
          <div className="material-study-heading"><div><span className="material-number">03 / GOOEY</span><h2>操作，自然相融</h2></div><span className="material-tag">快捷操作</span></div>
          <div className="material-stage material-gooey-stage" onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); closeMenu() } }}>
            <span className="material-stage-note">YOUR NEXT CREATION</span>
            {stop ? <div className="material-static-menu"><button onClick={() => action('新建相册')}>新建相册</button><button onClick={() => action('上传照片')}>上传照片</button><button onClick={() => action('分享作品')}>分享作品</button></div> : <Liquid className="material-liquid" blur={6} contrast={18} filterPadding={140} fill={dark ? '#e4eaf4' : '#26364d'} shadow="0 4px 16px rgba(0,0,0,.12)">
              {([{ icon:'↑', label:'上传照片', x:-78, y:-55 },{ icon:'↗', label:'分享作品', x:78, y:-55 },{ icon:'▧', label:'新建相册', x:0, y:-105 }]).map(item => <Liquid.Item style={{position: 'absolute', left: 0, top: 0, width: 52, height: 52}} radius={26} key={item.label} x={open ? item.x : 0} y={open ? item.y : 0} transition="bouncy"><button className="material-round-button material-secondary-orb" aria-label={item.label} tabIndex={open ? 0 : -1} aria-hidden={!open} style={{visibility:open ? 'visible' : 'hidden'}} onClick={() => action(item.label)}>{item.icon}</button></Liquid.Item>)}
              <Liquid.Item style={{position: 'absolute', left: 0, top: 0, width: 52, height: 52}} radius={26}><button className="material-round-button material-plus" ref={menuTrigger} aria-label={open ? '关闭快捷操作' : '展开快捷操作'} aria-expanded={open} onClick={() => setOpen(!open)}><svg style={{transform:`rotate(${open ? 45 : 0}deg)`}} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button></Liquid.Item>
            </Liquid>}
            <span className="material-gooey-hint">{stop ? '静态操作组 · 全部功能可用' : open ? '选择操作 · Escape 收起' : '点击 +，让灵感展开'}</span>
          </div>
          <div className="material-detail-row"><span>圆润融合 / 弹性展开</span><span className="material-mono">blur 6 · contrast 18</span></div><p className="material-caption">把常用动作聚在一起，让工具更轻盈。</p>
        </section>

        <section className="material-study material-metal">
          <div className="material-study-heading"><div><span className="material-number">04 / METAL</span><h2>重要时刻，自带质感</h2></div><span className="material-tag">主要操作</span></div>
          <div className="material-stage material-metal-stage"><span className="material-metal-watermark" aria-hidden="true">MAKE<br />IT MATTER.</span><MetalFx preset={preset} strength={strength} theme={theme} paused={stop} innerShadow normalizeHostStyles={false}><button className="material-metal-button" onClick={() => setMessage('开始创作 · Metal 主操作已触发')}>开始创作 <span aria-hidden="true">↗</span></button></MetalFx><span className="material-metal-note">移动指针，观察金属光泽</span></div>
          <div className="material-controls material-controls-two"><label>金属材质<select value={preset} onChange={e => setPreset(e.target.value as MetalFxPreset)}>{['chromatic','silver','gold'].map(x => <option key={x}>{x}</option>)}</select></label><div className="material-fixed-strength">光效强度<span>{strength.toFixed(2)} / 固定</span></div></div><p className="material-caption">只为少数关键操作，保留高光。</p>
        </section>
      </div>

      <section className="material-decision"><span className="material-number">NEXT / 小范围试点</span><div><h2>先找到感觉，再进入产品。</h2><p>建议从登录、AI 分析与仪表盘开始。确认这份预览后，再接入真实页面。</p></div><a href="/design-system.html" className="material-text-link">原组件库 <span aria-hidden="true">↗</span></a></section>
      <footer className="material-footer"><span>LensFlow / Material Studies — 2026</span><span role="status" aria-live="polite">{message}</span><span>Powered by Libraries.dev</span></footer>
    </div>
  </main>
}
