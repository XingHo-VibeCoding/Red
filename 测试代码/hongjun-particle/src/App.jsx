import ParticleText from './components/ParticleText.jsx';
import ThreeDCardDemo from './components/3d-card-demo.jsx';

export default function App() {
  return (
    <div className="page">
      <header className="page-header">
        <p className="page-subtitle">星火燎原 · 粒子重组</p>
        <h1 className="page-title">红军</h1>
      </header>

      <div className="stage">
        <ParticleText
          text="红军"
          particleSize={2.6}
          density={3}
          color="#e63946"
          highlightColor="#ffd166"
          scatter={220}
          gatherDuration={1800}
          stagger={500}
          pointerRepel={50}
          repelRadius={130}
          idleDrift={0.6}
          trigger="hover"
          fontSize="clamp(5rem, 22vw, 14rem)"
          fontWeight={900}
          glow
        />
      </div>

      <p className="page-hint">鼠标移入文字区域：粒子平滑飞散，再重新聚成「红军」二字</p>

      <section className="card-section">
        <h2 className="card-section-title">组件二：3D 悬浮卡片</h2>
        <ThreeDCardDemo />
      </section>
    </div>
  );
}
