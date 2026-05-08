import React, { createContext, useContext, useState, useEffect } from 'react';

const UIContext = createContext();

export function UIProvider({ children }) {
    const [isSidebarFixed, setIsSidebarFixed] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem('isSidebarFixed');
        if (saved !== null) {
            try {
                setIsSidebarFixed(JSON.parse(saved));
            } catch (e) {
                console.error("Error parsing isSidebarFixed", e);
            }
        }
    }, []);

    const toggleSidebarFixed = (value) => {
        setIsSidebarFixed(value);
        localStorage.setItem('isSidebarFixed', JSON.stringify(value));
    };

    return (
        <UIContext.Provider value={{ isSidebarFixed, toggleSidebarFixed }}>
            {children}
        </UIContext.Provider>
    );
}

export const useUI = () => useContext(UIContext);
