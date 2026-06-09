import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';


class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:40,color:"#fff",background:"#1a1a2e",fontFamily:"monospace",minHeight:"100vh"}}>
          <h1 style={{color:"#e74c3c"}}>⚠ Ошибка приложения</h1>
          <pre style={{color:"#f39c12",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{color:"#888",whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:12}}>
            {this.state.info?.componentStack}
          </pre>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{marginTop:20,padding:"12px 24px",background:"#e74c3c",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:14}}>
            🗑 Очистить кэш и перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Регистрация сервис-воркера для поддержки автономной работы (PWA)
serviceWorkerRegistration.register();

