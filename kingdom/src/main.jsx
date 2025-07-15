import React from 'react';
import ReactDOM from 'react-dom/client'; // Correct import for React 18
import App from './App.jsx'; // Ensure correct path to your App component

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
