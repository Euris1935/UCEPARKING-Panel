
import BarraLateral from './barraLateral'

export default function Layout({ children }) {
  return (
    <div style={styles.contenedor}>
      <BarraLateral />
      <div style={styles.contenido}>
        {children}
      </div>
    </div>
  )
}

const styles = {
  contenedor: {
    display: 'flex'
  },
  contenido: {
    marginLeft: '240px',
    padding: '20px',
    width: '100%'
  }
}
  


