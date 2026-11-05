import { createRoot } from 'react-dom/client';
import '@fontsource-variable/jost';
import '@fontsource-variable/martian-mono';
import './styles/index.css';
import { App } from './app/App.jsx';

createRoot(document.getElementById('root')).render(<App />);
