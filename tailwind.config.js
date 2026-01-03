/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}",
    ],
    theme: {
        extend: {},
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
            const maxW = "var(--containerMaxW)"; // 1800px
            
            // LOGIC CHANGE: 
            // We use min(100vw, maxW) effectively clamping the base width.
            // When the screen is > 1800px, it uses 1800px.
            // When the screen is < 1800px, it uses 100vw.
            const effectiveWidth = `min(100vw, ${maxW})`;

            const oneColUnit = `(${effectiveWidth} - (${pad} * 2) - (${gut} * 11)) / 12`;

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

                // Bleeds (These will now stop growing once container hits max width)
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
        }
    ]
};