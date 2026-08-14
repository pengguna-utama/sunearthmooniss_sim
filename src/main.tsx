import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Tanpa StrictMode: engine imperatif (WebGL) di-manage manual; hindari double-mount dev.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);