import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Swal from 'sweetalert2';
import { scannerApi } from '../lib/api';

const socket = io(process.env.REACT_APP_BACKEND_URL || `http://${window.location.hostname}:4000`);

export default function GlobalScannerListener() {
  const barcodeBuffer = useRef('');
  const lastKeyTime = useRef(Date.now());
  const isProcessing = useRef(false);

  useEffect(() => {
    // ─── 1. INTERCEPCIÓN DE ESCÁNER USB (Keyboard Wedge) ───
    const handleKeyDown = async (e) => {
      // Ignorar si el usuario está escribiendo en un input o textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime.current;
      lastKeyTime.current = currentTime;

      // Si el tiempo entre teclas es muy grande, no es un escáner (o es un nuevo escaneo)
      if (timeDiff > 50) {
        barcodeBuffer.current = '';
      }

      // Si presiona Enter y hay algo en el buffer
      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length > 3 && !isProcessing.current) {
          e.preventDefault();
          const token = barcodeBuffer.current;
          barcodeBuffer.current = '';
          
          await procesarToken(token);
        }
      } else if (e.key && e.key.length === 1) { // Acumular caracteres válidos
        barcodeBuffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // ─── 2. INTERCEPCIÓN DE ESCÁNER SERIAL (Socket.IO) ───
    const onScannerResultado = (data) => {
      Swal.fire({
        title: '¡Salida Exitosa!',
        html: `
          <div class="text-left">
            <p><strong>Placa:</strong> ${data.placa || 'N/A'}</p>
            <p><strong>Visitante:</strong> ${data.visitante || 'N/A'}</p>
            <p><strong>Ticket:</strong> #${data.id_ticket || 'N/A'}</p>
            <p><strong>Duración:</strong> ${data.duracion_minutos != null ? data.duracion_minutos + ' min' : 'N/A'}</p>
            ${data.vencido ? '<p class="text-red-500 font-bold">¡Ticket vencido!</p>' : ''}
          </div>
        `,
        icon: 'success',
        timer: 5000,
        toast: true,
        position: 'top-end',
        showConfirmButton: false
      });
    };

    const onScannerError = (data) => {
      Swal.fire({
        title: 'Error de Escáner',
        text: data.mensaje || 'Token inválido o no encontrado.',
        icon: 'error',
        timer: 4000,
        toast: true,
        position: 'top-end',
        showConfirmButton: false
      });
    };

    socket.on("salida-escaner", onScannerResultado);
    socket.on("scanner-error", onScannerError);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      socket.off("salida-escaner", onScannerResultado);
      socket.off("scanner-error", onScannerError);
    };
  }, []);

  const procesarToken = async (token) => {
    isProcessing.current = true;
    try {
      Swal.fire({
        title: 'Procesando escaneo...',
        text: 'Validando ticket...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const resultado = await scannerApi.procesarSalidaTicket(token);

      Swal.fire({
        title: '¡Salida Exitosa!',
        html: `
          <div class="text-left">
            <p><strong>Placa:</strong> ${resultado.placa || 'N/A'}</p>
            <p><strong>Visitante:</strong> ${resultado.visitante_nombre ? resultado.visitante_nombre + ' ' + (resultado.visitante_apellido || '') : 'N/A'}</p>
            <p><strong>Duración:</strong> ${resultado.duracion_minutos != null ? resultado.duracion_minutos + ' min' : 'N/A'}</p>
            ${resultado.vencido ? '<p class="text-red-500 font-bold">¡Ticket vencido!</p>' : ''}
          </div>
        `,
        icon: 'success',
        timer: 5000,
        showConfirmButton: true,
        confirmButtonColor: '#10B981'
      });
    } catch (error) {
      Swal.fire({
        title: 'Error de Escaneo',
        text: error.message || 'No se pudo procesar el ticket.',
        icon: 'error',
        confirmButtonColor: '#EF4444'
      });
    } finally {
      isProcessing.current = false;
    }
  };

  return null; // Este componente no renderiza nada en pantalla
}
