
import React from 'react';

const Spinner: React.FC = () => (
    <svg
        className="animate-spin h-9 w-9 relative"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <defs>
            <linearGradient id="spinner-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
        </defs>
        <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            className="text-white/10"
            strokeWidth="3"
        />
        <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="url(#spinner-grad)"
            strokeWidth="3"
            strokeLinecap="round"
        />
    </svg>
);

export default Spinner;
