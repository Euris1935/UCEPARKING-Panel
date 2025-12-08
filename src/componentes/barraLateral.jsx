/*
import { Link } from "react-router-dom";

export default function BarraLateral() {
  return (
    <div style={styles.sidebar}>
      <h2 style={styles.logo}>UCE PARKING</h2>

      <nav style={styles.menu}>
        <Link to="/">Dashboard</Link>
        <Link to="/ocupacion">Ocupación</Link>
        <Link to="/reservaciones">Reservaciones</Link>
        <Link to="/usuarios">Usuarios</Link>
      </nav>
    </div>
  );
}

const styles = {
  sidebar: {
    width: "220px",
    height: "100vh",
    background: "#fff",
    padding: "20px",
    boxShadow: "2px 0 5px rgba(0,0,0,0.05)",
  },
  logo: { marginBottom: "30px" },
  menu: {
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  },
};

*/

/*

import { FaTachometerAlt, FaCar, FaClipboardList, FaUsers, FaWrench } from 'react-icons/fa'

export default function BarraLateral() {
  return (
    <div style={styles.sidebar}>
     <h2 style={styles.logoGreen}>Park Admin</h2>

      <div style={styles.menu}>
        <a style={styles.link}>
          <FaTachometerAlt style={styles.icon} />
          Dashboard
        </a>

        <a style={styles.link}>
          <FaCar style={styles.icon} />
          Ocupación
        </a>

        <a style={styles.link}>
          <FaClipboardList style={styles.icon} />
          Reservaciones
        </a>

        <a style={styles.link}>
          <FaUsers style={styles.icon} />
          Usuarios
        </a>

        <a style={styles.link}>
          <FaWrench style={styles.icon} />
          Mantenimiento
        </a>
      </div>
    </div>
  )
}

const styles = {
  sidebar: {
    width: '220px',
    height: '100vh',
    background: '#ffffff',
    borderRight: '1px solid #e5e7eb',
    padding: '20px'
  },
  logo: {
    marginBottom: '30px',
    fontWeight: 'bold'
  },
  menu: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#374151',        // gris oscuro
    textDecoration: 'none',  // quita el subrayado
    fontSize: '16px',
    cursor: 'pointer'
  },
  icon: {
    fontSize: '16px'
  },
  logoGreen: {
  color: '#22c55e',
  marginBottom: '30px',
  fontWeight: 'bold'
},

}

*/

/*
import { Link } from 'react-router-dom'
import { FaTachometerAlt, FaCar, FaClipboardList, FaUsers, FaWrench } from 'react-icons/fa'

export default function BarraLateral() {
  return (
    <div style={styles.sidebar}>
      <h2 style={styles.logoGreen}>Park Admin</h2>

      <div style={styles.menu}>
        <Link to="/" style={styles.link}>
          <FaTachometerAlt style={styles.icon} />
          Dashboard
        </Link>

        <Link to="/ocupacion" style={styles.link}>
          <FaCar style={styles.icon} />
          Ocupación
        </Link>

        <Link to="/reservaciones" style={styles.link}>
          <FaClipboardList style={styles.icon} />
          Reservaciones
        </Link>

        <Link to="/usuarios" style={styles.link}>
          <FaUsers style={styles.icon} />
          Usuarios
        </Link>

        <Link to="/mantenimiento" style={styles.link}>
          <FaWrench style={styles.icon} />
          Mantenimiento
        </Link>
      </div>
    </div>
  )
}

const styles = {
  sidebar: {
    width: '220px',
    height: '100vh',
    background: '#ffffff',
    borderRight: '1px solid #e5e7eb',
    padding: '20px',
    position: 'fixed',
    left: 0,
    top: 0
  },
  logoGreen: {
    color: '#22c55e',
    marginBottom: '30px',
    fontWeight: 'bold'
  },
  menu: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#374151',
    textDecoration: 'none',
    fontSize: '16px',
    cursor: 'pointer'
  },
  icon: {
    fontSize: '16px'
  }
}

*/


import { Link } from 'react-router-dom'
import { 
  FaTachometerAlt,
  FaCar,
  FaClipboardList,
  FaUsers,
  FaWrench,
  FaMicrochip,
  FaChartBar
} from 'react-icons/fa'

export default function BarraLateral() {
  return (
    <div style={styles.sidebar}>
      <h2 style={styles.logoGreen}>Park Admin</h2>

      <div style={styles.menu}>
        <Link to="/" style={styles.link}>
          <FaTachometerAlt /> Dashboard
        </Link>

        <Link to="/ocupacion" style={styles.link}>
          <FaCar /> Ocupación
        </Link>

        <Link to="/reservaciones" style={styles.link}>
          <FaClipboardList /> Reservaciones
        </Link>

        <Link to="/usuarios" style={styles.link}>
          <FaUsers /> Usuarios
        </Link>

        <Link to="/sensores" style={styles.link}>
          <FaMicrochip /> Sensores
        </Link>

        <Link to="/reportes" style={styles.link}>
          <FaChartBar /> Reportes
        </Link>

        <Link to="/mantenimiento" style={styles.link}>
          <FaWrench /> Mantenimiento
        </Link>
      </div>
    </div>
  )
}

const styles = {
  sidebar: {
    width: '220px',
    height: '100vh',
    background: '#ffffff',
    borderRight: '1px solid #e5e7eb',
    padding: '20px',
    position: 'fixed'
  },
  logoGreen: {
    color: '#22c55e',
    fontWeight: 'bold',
    marginBottom: '30px'
  },
  menu: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#374151',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: '500'
  }
}



