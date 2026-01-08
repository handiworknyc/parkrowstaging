/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}",
    ],
    theme: {
    	extend: {
    		borderRadius: {
    			lg: 'var(--radius)',
    			md: 'calc(var(--radius) - 2px)',
    			sm: 'calc(var(--radius) - 4px)'
    		},
    		colors: {
    			background: 'hsl(var(--background))',
    			foreground: 'hsl(var(--foreground))',
    			card: {
    				DEFAULT: 'hsl(var(--card))',
    				foreground: 'hsl(var(--card-foreground))'
    			},
    			popover: {
    				DEFAULT: 'hsl(var(--popover))',
    				foreground: 'hsl(var(--popover-foreground))'
    			},
    			primary: {
    				DEFAULT: 'hsl(var(--primary))',
    				foreground: 'hsl(var(--primary-foreground))'
    			},
    			secondary: {
    				DEFAULT: 'hsl(var(--secondary))',
    				foreground: 'hsl(var(--secondary-foreground))'
    			},
    			muted: {
    				DEFAULT: 'hsl(var(--muted))',
    				foreground: 'hsl(var(--muted-foreground))'
    			},
    			accent: {
    				DEFAULT: 'hsl(var(--accent))',
    				foreground: 'hsl(var(--accent-foreground))'
    			},
    			destructive: {
    				DEFAULT: 'hsl(var(--destructive))',
    				foreground: 'hsl(var(--destructive-foreground))'
    			},
    			border: 'hsl(var(--border))',
    			input: 'hsl(var(--input))',
    			ring: 'hsl(var(--ring))',
    			chart: {
    				'1': 'hsl(var(--chart-1))',
    				'2': 'hsl(var(--chart-2))',
    				'3': 'hsl(var(--chart-3))',
    				'4': 'hsl(var(--chart-4))',
    				'5': 'hsl(var(--chart-5))'
    			}
    		}
    	}
    },
    corePlugins: {
        visibility: false,
    },
    plugins: [
        function ({ addUtilities }) {
            const cols = {};
            const pushes = {};
            const pulls = {};
            const bleeds = {};

            const pad = "var(--containerPadding)";
            const gut = "1.5rem";
            const maxW = "var(--containerMaxW)";
            
            const effectiveWidth = `min(100vw, ${maxW})`;

            const oneColUnit = `(${effectiveWidth} - (${pad} * 2) - (${gut} * 11)) / 12`;

            /* ---------------------------------------------------------
               NEW: Push-Half (0.5 column + 0.5 gutter)
            --------------------------------------------------------- */
            pushes['.push-h'] = {
                marginLeft: `calc( (${oneColUnit} * 0.5) + (${gut} * 0.5) )`
            };

            // Optional: Pull-Half if you need it
            pulls['.pull-h'] = {
                 marginLeft: `calc( ((${oneColUnit} * 0.5) + (${gut} * 0.5)) * -1 )`
            };

            for (let i = 1; i <= 12; i++) {
                // Column Widths
                cols[`.col-${i}`] = { 
                    width: `calc( (${oneColUnit} * ${i}) + (${gut} * ${i}) )`
                };

                const marginCalc = `calc( (${oneColUnit} * ${i}) + (${gut} * ${i}) )`;

                // Push / Pull
                pushes[`.push-${i}`] = { marginLeft: marginCalc };
                pulls[`.pull-${i}`] = { marginLeft: `calc(${marginCalc} * -1)` };
                
                const standardColWidth = `( (${oneColUnit} * ${i}) + (${gut} * ${i}) )`;

                // Bleeds
                bleeds[`.bleed-left.col-${i}`] = {
                    marginLeft: `calc(${pad} * -1)`,
                    width: `calc( ${pad} + ${standardColWidth} )`,
                };

                bleeds[`.bleed-right.col-${i}`] = {
                    marginRight: `calc(${pad} * -1)`,
                    marginLeft: "auto",
                    width: `calc( ${pad} + ${standardColWidth} )`,
                };
            }

            const aligns = {
                '.align-center': { marginLeft: 'auto', marginRight: 'auto' },
                '.align-right': { marginLeft: 'auto', marginRight: '0' },
                '.align-left': { marginLeft: '0', marginRight: 'auto' }
            };

            addUtilities(cols);
            addUtilities(pushes);
            addUtilities(pulls);
            addUtilities(bleeds);
            addUtilities(aligns);
        },
        require("tailwindcss-animate")
    ]
};