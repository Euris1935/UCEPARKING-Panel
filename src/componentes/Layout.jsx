

import BarraLateral from './barraLateral'

export default function Layout({ children }) {
  return (
    
    <div className="flex bg-uce-light min-h-screen"> 
      <BarraLateral />
      
      <main className="ml-64 flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
  
