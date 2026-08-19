/**
 * Deploy nach GitHub Pages ohne GitHub Actions.
 *
 * Baut app/dist und pusht den Inhalt als eigenständigen Commit auf gh-pages.
 * Bewusst ohne Workflow-Datei: der vorhandene gh-Token hat keinen 'workflow'-Scope.
 * Mit `gh auth refresh -s workflow` liesse sich später auf CI-Deploy umstellen.
 */
import { execSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(APP, 'dist')
const REPO_ROOT = resolve(APP, '..')

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })
const capture = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8' }).trim()

console.log('→ Build …')
run('npm run build', APP)

if (!existsSync(DIST)) throw new Error('dist/ fehlt — Build fehlgeschlagen')

// .nojekyll: sonst ignoriert GitHub Pages Dateien und Ordner mit führendem Unterstrich.
writeFileSync(resolve(DIST, '.nojekyll'), '')

const remote = capture('git remote get-url origin', REPO_ROOT)
const sourceSha = capture('git rev-parse --short HEAD', REPO_ROOT)

console.log(`→ Push nach gh-pages (${remote}) …`)
rmSync(resolve(DIST, '.git'), { recursive: true, force: true })
run('git init -q -b gh-pages', DIST)
run('git add -A', DIST)
run(`git -c user.name="CampBuddy Deploy" -c user.email="deploy@localhost" commit -q -m "Deploy von ${sourceSha}"`, DIST)
run(`git push -q --force ${remote} gh-pages`, DIST)
rmSync(resolve(DIST, '.git'), { recursive: true, force: true })

console.log('✓ Deployed. GitHub Pages braucht danach ~1 Minute.')
