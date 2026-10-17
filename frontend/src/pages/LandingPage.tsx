import { useNavigate } from 'react-router-dom'
import { PublicShell } from '@/components/material/PublicShell'
import { Button } from '@/components/ui'
import { ParticlePortrait } from '@/components/material/ParticlePortrait'

const features = [
  {number:'01 / CONNECT',title:'从预约开始',description:'记录拍摄需求与时间，让客户与摄影师更容易找到同一个方向。',action:'预约摄影师',path:'/booking'},
  {number:'02 / CREATE',title:'让创作流动',description:'上传素材、查看分析、协作修图，把精力留给画面本身。',action:'进入工作台',path:'/login'},
  {number:'03 / DELIVER',title:'把作品交到手中',description:'选出喜欢的照片，查看修图进展，在自己的空间接收最终成片。',action:'查看我的订单',path:'/client'},
]

export function LandingPage() {
  const navigate = useNavigate()

  return <PublicShell><main>
    <section className="material-home-hero">
      <ParticlePortrait />
      <div className="material-home-copy">
      <p className="material-eyeline">THE FEELING OF FLOW</p>
      <h1>每一次拍摄，<br/><span>都值得流畅抵达。</span></h1>
      <p>从第一份拍摄需求，到最后一张成片。<br/>LensFlow 连接预约、素材、选片与交付，让创作始终清晰。</p>
      <div className="material-home-actions">
        <Button effect="metal" size="lg" onClick={()=>navigate('/login')}>开启创作空间 <span aria-hidden="true">↗</span></Button>
        <Button variant="plain" onClick={()=>navigate('/booking')}>预约一次拍摄 →</Button>
      </div>
      </div>
    </section>
    <section className="material-home-grid" aria-label="创作流程">
      {features.map(feature=><article className="material-home-card" data-cursor-card key={feature.number}>
        <span className="material-overline">{feature.number}</span><h2>{feature.title}</h2><p>{feature.description}</p>
        <Button variant="plain" onClick={()=>navigate(feature.path)}>{feature.action} →</Button>
      </article>)}
    </section>
  </main></PublicShell>
}
