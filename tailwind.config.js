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
            const colPaddings = {};
            const bleeds = {};

            const pad = "var(--containerPadding)";
            const gut = "1.5rem";
            const maxW = "var(--containerMaxW)";

            /* ---------------------------------------------------------
               1. MATH SETUP (VIEWPORT BASED)
            --------------------------------------------------------- */
            
            const effectiveWidth = `min(100vw, ${maxW})`;
            const oneColUnit = `((${effectiveWidth} - (${pad} * 2) - (${gut} * 11)) / 12)`;

            /* ---------------------------------------------------------
               2. FULL VIEWPORT BLEED
            --------------------------------------------------------- */
            bleeds['.bleed-x'] = {
                width: '100vw',
                marginLeft: 'calc(50% - 50vw)',
                marginRight: 'calc(50% - 50vw)',
                maxWidth: '100vw',
                padding: '0' 
            };

            /* ---------------------------------------------------------
               3. CONTAINER BLEED
            --------------------------------------------------------- */
            bleeds['.bleed-container'] = {
                width: `calc(100% + (${pad} * 2))`,
                marginLeft: `calc(${pad} * -1)`,
                marginRight: `calc(${pad} * -1)`
            };

            /* ---------------------------------------------------------
               4. SMART BLEED UTILITIES
               Stop applying negative margins above container max-width
            --------------------------------------------------------- */
            
            // Below max-width: use viewport-based calculation
            bleeds['.bleed-left'] = {
                '@media (max-width: 2000px)': {
                    '&[class]': {
                        width: `calc(var(--col-width) + ${pad})`,
                        marginLeft: `calc(${pad} * -1)`,
                    }
                },
                // Above max-width: container is centered, use container-based calculation
                '@media (min-width: 2001px)': {
                    '&[class]': {
                        width: `var(--col-width)`,
                    }
                }
            };

            bleeds['.bleed-right'] = {
                '@media (max-width: 2000px)': {
                    '&[class]': {
                        width: `calc(var(--col-width) + ${pad})`,
                        marginRight: `calc(${pad} * -1)`,
                        marginLeft: 'auto'
                    }
                },
                // Above max-width: container is centered, use container-based calculation
                '@media (min-width: 2001px)': {
                    '&[class]': {
                        width: `var(--col-width)`,
                        marginLeft: 'auto'
                    }
                }
            };

            /* ---------------------------------------------------------
               5. COLUMN LOOP (1-12)
            --------------------------------------------------------- */
            for (let i = 1; i <= 12; i++) {
                const standardColWidth = `((${oneColUnit} * ${i}) + (${gut} * (${i})))`;

                cols[`.col-${i}`] = { 
                    '--col-width': `calc(${standardColWidth})`,
                    width: `var(--col-width)`,
                    minWidth: `var(--col-width)`,
                };

                const spacingCalc = `((${oneColUnit} * ${i}) + (${gut} * ${i}))`;

                pushes[`.push-${i}`] = { marginLeft: `calc(${spacingCalc})` };
                pulls[`.pull-${i}`] = { marginLeft: `calc(${spacingCalc} * -1)` };

                colPaddings[`.pl-col-${i}`] = { paddingLeft: `calc(${spacingCalc}) !important` };
                colPaddings[`.pr-col-${i}`] = { paddingRight: `calc(${spacingCalc}) !important` };
            }
            
            const halfPushCalc = `((${oneColUnit} * 0.5) + (${gut} * 0.5))`;

            pushes['.push-h'] = { marginLeft: `calc(${halfPushCalc})` };
            pulls['.pull-h'] = { marginLeft: `calc(${halfPushCalc} * -1)` };
            
            colPaddings['.pl-col-h'] = { paddingLeft: `calc(${halfPushCalc}) !important` };
            colPaddings['.pr-col-h'] = { paddingRight: `calc(${halfPushCalc}) !important` };

            const aligns = {
                '.align-center': { marginLeft: 'auto', marginRight: 'auto' },
                '.align-right': { marginLeft: 'auto', marginRight: '0' },
                '.align-left': { marginLeft: '0', marginRight: 'auto' }
            };

            addUtilities(cols);
            addUtilities(pushes);
            addUtilities(pulls);
            addUtilities(colPaddings);
            addUtilities(bleeds);
            addUtilities(aligns);
        },
        require("tailwindcss-animate")
    ]
};