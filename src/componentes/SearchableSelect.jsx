import React, { useState, useRef, useEffect } from 'react';
import { FaChevronDown } from 'react-icons/fa';

export default function SearchableSelect({
    options,
    value, 
    onChange, 
    disabled = false,
    placeholder = "— Seleccionar —",
    className = "",
    focusRingClass = "focus:ring-purple-500",
    selectedItemClass = "bg-purple-100 text-purple-800"
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    const selectedOption = options.find(o => String(o.value) === String(value));

    // Si el menú está cerrado, mostramos el label del valor.
    // Si está abierto, mostramos el estado 'search' temporal.
    const inputValue = isOpen ? search : (selectedOption ? selectedOption.label : '');

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredOptions = options.filter(o => 
        o.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div ref={wrapperRef} className={`relative ${className} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="relative w-full">
                <input
                    type="text"
                    className={`w-full border rounded-lg p-2 pr-8 text-sm focus:outline-none focus:ring-2 border-gray-200 mt-0.5 placeholder-gray-500 cursor-text ${focusRingClass}`}
                    placeholder={placeholder}
                    value={inputValue}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        if (!isOpen) setIsOpen(true);
                        // Limpiar la selección si borra todo el texto manual
                        if (e.target.value === '') {
                             onChange('');
                        }
                    }}
                    onFocus={() => {
                        setSearch(''); // Limpia al dar click para mostrar todas las opciones
                        setIsOpen(true);
                    }}
                    disabled={disabled}
                />
                <FaChevronDown 
                    className={`absolute right-3 top-4 text-gray-400 pointer-events-none transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
                    size={12} 
                />
            </div>

            {/* Menú Desplegable sin buscador interno */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    <div className="py-1">
                        {filteredOptions.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500 text-center">No hay resultados.</div>
                        ) : (
                            filteredOptions.map(opt => (
                                <div
                                    key={opt.value}
                                    className={`px-3 py-2 text-sm cursor-pointer transition-colors ${String(opt.value) === String(value) ? `${selectedItemClass} font-bold` : 'text-gray-700 hover:bg-gray-100'}`}
                                    onMouseDown={(e) => {
                                        // onMouseDown previene que el input pierda focus antes de registrar el clic
                                        e.preventDefault(); 
                                        onChange(opt.value);
                                        setIsOpen(false);
                                    }}
                                >
                                    {opt.label}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
