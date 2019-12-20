import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import pkg from './package.json';
import babel from 'rollup-plugin-babel';
import { uglify } from 'rollup-plugin-uglify';

const ensureArray = maybeArr =>
    Array.isArray(maybeArr) ? maybeArr : [maybeArr];

const external = Object.keys(pkg.dependencies || {});

const makeExternalPredicate = externalArr => {
    if (externalArr.length === 0) {
        return () => false;
    }
    const pattern = new RegExp(`^(${externalArr.join('|')})($|/)`);
    return id => pattern.test(id);
};

const createConfig = ({ output, min = false } = {}) => {
    return {
        input: 'src/index.js',
        output: ensureArray(output).map(output => {
            output.name = 'EventReporter';
            if (min) {
                output.file = output.file.replace(/\.js$/, '.min.js');
            }

            return output
        }),
        plugins: [
            resolve(),
            babel({
                exclude: 'node_modules/**',
                runtimeHelpers: true,
                plugins: [
                    [
                        '@babel/transform-runtime',
                        {
                            useESModules: output.format === 'es'
                        }
                    ]
                ]
            }),
            commonjs(),
            min &&
            uglify({
                compress: {
                    pure_getters: true,
                    unsafe: true,
                    unsafe_comps: true
                }
            })
        ].filter(Boolean),
        external: makeExternalPredicate(output.format === 'umd' ? [] : external)
    };
};

export default [
    createConfig({
        output: {
            file: pkg.browser,
            format: 'umd'
        }
    }),
    createConfig({
        output: {
            file: pkg.browser,
            format: 'umd'
        },
        min: true
    }),
    createConfig({
        output: {
            file: pkg.main,
            format: 'cjs'
        }
    }),
    createConfig({
        output: {
            file: pkg.module,
            format: 'es'
        }
    })
];