import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';


class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      isFixed: false,
      initialVersion: null 
    };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("AutoHealing ErrorBoundary caught:", error, info);
    
    // 1. Report Error to AI Team
    fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error_message: error.toString(),
        component_stack: info.componentStack,
        url: window.location.href
      })
    }).catch(console.error);

    // 2. Fetch current version and start polling
    fetch("/api/version")
      .then(r => r.json())
      .then(data => {
        this.setState({ initialVersion: data.version });
        this.pollForFix(data.version);
      }).catch(() => {
        this.pollForFix("unknown");
      });
  }

  pollForFix = (brokenVersion) => {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      fetch("/api/version")
        .then(r => r.json())
        .then(data => {
          if (data.version && data.version !== brokenVersion) {
            clearInterval(this.interval);
            this.interval = null;
            this.setState({ isFixed: true });
            setTimeout(() => {
              window.location.reload();
            }, 3000);
          }
        }).catch(console.error);
    }, 5000);
  }

  componentWillUnmount() {
    if (this.interval) clearInterval(this.interval);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100vh", backgroundColor: "#0F0F13", color: "#fff", fontFamily: "sans-serif", textAlign: "center", padding: 20
        }}>
          {this.state.isFixed ? (
            <>
              <div style={{fontSize: 64, marginBottom: 20}}>✨</div>
              <h1 style={{color: "#4CAF50"}}>Код успешно обновлён!</h1>
              <p style={{color: "#888", maxWidth: 400}}>Наши ИИ-инженеры выкатили новую версию. Сейчас страница будет перезагружена...</p>
            </>
          ) : (
            <>
              <div style={{fontSize: 64, marginBottom: 20, animation: "spin 2s linear infinite", display: "inline-block"}}>⚙️</div>
              <h1 style={{color: "#FF4081"}}>Упс, произошел сбой</h1>
              <p style={{color: "#888", maxWidth: 400, lineHeight: 1.5, marginBottom: 30}}>
                Но не переживайте! Наши автономные ИИ-инженеры уже получили отчет об ошибке и прямо сейчас пересобирают код. <br/><br/>
                Пожалуйста, не закрывайте страницу. Как только выйдет фикс, она обновится автоматически.
              </p>
              
              {/* Fallback button if user doesn't want to wait */}
              <button onClick={() => { localStorage.clear(); window.location.reload(); }}
                style={{padding:"10px 20px",background:"transparent",color:"#FF4081",border:"1px solid #FF4081",borderRadius:8,cursor:"pointer",fontSize:13}}>
                Перезагрузить вручную
              </button>
              <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            </>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Регистрация сервис-воркера для поддержки автономной работы (PWA)
serviceWorkerRegistration.unregister();

