import React, { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: 20, color: 'white', background: 'red', zIndex: 9999, position: 'absolute', top: 0 }}><pre>{this.state.error.stack || this.state.error.toString()}</pre></div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
