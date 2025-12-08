/*
import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;

*/

/*
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./paginas/Dashboard";
import Usuarios from "./paginas/Usuarios";
import Reservaciones from "./paginas/Reservaciones";
import Ocupacion from "./paginas/Ocupacion";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/reservaciones" element={<Reservaciones />} />
        <Route path="/ocupacion" element={<Ocupacion />} />
      </Routes>
    </Router>
  );
}

export default App;

*/

/*

import { BrowserRouter, Routes, Route } from 'react-router-dom'

import Dashboard from './paginas/Dashboard'
import Usuarios from './paginas/Usuarios'
import Reservaciones from './paginas/Reservaciones'
import Ocupacion from './paginas/Ocupacion'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/reservaciones" element={<Reservaciones />} />
        <Route path="/ocupacion" element={<Ocupacion />} />
      </Routes>
    </BrowserRouter>
  )
}

*/

import { BrowserRouter, Routes, Route } from 'react-router-dom'

import Dashboard from './paginas/Dashboard'
import Usuarios from './paginas/Usuarios'
import Reservaciones from './paginas/Reservaciones'
import Ocupacion from './paginas/Ocupacion'
import Mantenimiento from './paginas/Mantenimiento'
import Reportes from './paginas/Reportes'
import Sensores from './paginas/Sensores'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/reservaciones" element={<Reservaciones />} />
        <Route path="/ocupacion" element={<Ocupacion />} />
        <Route path="/mantenimiento" element={<Mantenimiento />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/sensores" element={<Sensores />} />
      </Routes>
    </BrowserRouter>
  )
}
