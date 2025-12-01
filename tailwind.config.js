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
            const gut = "20px";
            
            const oneColUnit = `(100vw - (${pad} * 2) - (${gut} * 11)) / 12`;

            for (let i = 1; i <= 12; i++) {
                cols[`.col-${i}`] = { 
                    width: `calc( (${oneColUnit} * ${i}) + (${gut} * ${i}) )` 
                };

                const marginCalc = `calc( (${oneColUnit} * ${i}) + (${gut} * ${i}) )`;

                pushes[`.push-${i}`] = { marginLeft: marginCalc };
                pulls[`.pull-${i}`] = { marginLeft: `calc(${marginCalc} * -1)` };
                
                const standardColWidth = `( (${oneColUnit} * ${i}) + (${gut} * ${i}) )`;

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