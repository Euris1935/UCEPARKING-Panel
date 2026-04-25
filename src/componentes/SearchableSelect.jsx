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
    selectedItemClass = "bg-purple-100 text-purple-800",
    groupLabelClass = "text-gray-400 bg-gray-50"
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    const selectedOption = options.find(o => String(o.value) === String(value));
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

    const filteredOptions = (() => {
        if (!search) return options;
        const result = [];
        const searchLower = search.toLowerCase();
        
        let pendingGroup = null;
        let groupMatchesSearch = false;

        options.forEach(opt => {
            if (opt.isGroup) {
                pendingGroup = opt;
                groupMatchesSearch = opt.label.toLowerCase().includes(searchLower);
                // Si el grupo mismo coincide, lo añadimos de inmediato
                if (groupMatchesSearch) {
                    result.push(opt);
                }
            } else {
                // Si el grupo padre coincidió o el item actual coincide
                const itemMatchesSearch = opt.label.toLowerCase().includes(searchLower);
                
                if (groupMatchesSearch || itemMatchesSearch) {
                    // Si el item coincide pero el grupo no se ha añadido aún (porque el grupo no coincidía)
                    if (pendingGroup && !groupMatchesSearch) {
                        result.push(pendingGroup);
                    }
                    // Marcamos el grupo como ya procesado para este bloque de items
                    pendingGroup = null; 
                    result.push(opt);
                }
            }
        });
        return result;
    })();

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
                        if (e.target.value === '') onChange('');
                    }}
                    onFocus={() => {
                        setSearch('');
                        setIsOpen(true);
                    }}
                    disabled={disabled}
                />
                <FaChevronDown 
                    className={`absolute right-3 top-4 text-gray-400 pointer-events-none transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
                    size={12} 
                />
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    <div className="py-1">
                        {filteredOptions.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500 text-center">No hay resultados.</div>
                        ) : (
                            filteredOptions.map((opt, index) => {
                                if (opt.isGroup) {
                                    return (
                                        <div 
                                            key={`group-${index}`}
                                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border-y border-gray-100 mt-1 first:mt-0 ${groupLabelClass}`}
                                        >
                                            {opt.label}
                                        </div>
                                    );
                                }

                                const isItemDisabled = opt.disabled === true;
                                const isSelected = String(opt.value) === String(value);
                                return (
                                    <div
                                        key={opt.value}
                                        className={`px-3 py-2 text-sm transition-colors
                                            ${isItemDisabled
                                                ? 'opacity-50 cursor-not-allowed bg-gray-50'
                                                : isSelected
                                                    ? `${selectedItemClass} font-bold cursor-pointer`
                                                    : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
                                            }`}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            if (!isItemDisabled) {
                                                onChange(opt.value);
                                                setIsOpen(false);
                                            }
                                        }}
                                        title={isItemDisabled && opt.subtitle ? opt.subtitle : undefined}
                                    >
                                        <div className="flex items-center gap-2">
                                            {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                                            <div className="flex-grow">
                                                <div>{opt.display || opt.label}</div>
                                                {opt.subtitle && (
                                                    <div className={`text-[10px] ${isItemDisabled ? 'text-red-400' : 'text-gray-400'}`}>
                                                        {opt.subtitle}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
