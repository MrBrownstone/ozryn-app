import fs from 'node:fs/promises'
import path from 'node:path'

export async function ensurePrivateDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  await fs.chmod(directory, 0o700)
}

export async function writePrivateFile(
  filename: string,
  contents: string,
): Promise<void> {
  await ensurePrivateDirectory(path.dirname(filename))
  const temporary = `${filename}.tmp`
  await fs.writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 })
  await fs.chmod(temporary, 0o600)
  await fs.rename(temporary, filename)
}

export async function writePrivateJson(
  filename: string,
  value: unknown,
): Promise<void> {
  await writePrivateFile(filename, `${JSON.stringify(value, null, 2)}\n`)
}
