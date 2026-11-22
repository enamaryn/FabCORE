"""Validate local Codex profiles without launching an agent or contacting a service."""
from pathlib import Path
import tomllib

root = Path(__file__).resolve().parent.parent
agents = list((root / '.codex/agents').glob('*.toml'))
assert len(agents) == 5, 'Five focused profiles expected'
for path in agents:
    profile = tomllib.loads(path.read_text())
    assert profile['name'] == path.stem, path
    for key in ('name', 'description', 'developer_instructions'):
        assert isinstance(profile.get(key), str) and profile[key].strip(), (path, key)
    assert len(profile['description']) < 200, path
    assert len(profile['developer_instructions']) < 1800, path
    assert 'model' not in profile and 'model_reasoning_effort' not in profile, path
config = tomllib.loads((root / '.codex/config.toml').read_text())
serena = config['mcp_servers']['serena']
assert serena['enabled'] is False, 'Unvalidated pilot must stay opt-in'
assert serena['env']['SERENA_USAGE_REPORTING'] == 'false'
assert '--project-from-cwd' in serena['args']
assert '7f7d6245bf96b60fdf4e752a779917372fd1ee6e' in ' '.join(serena['args'])
print('OK: five TOML profiles; optional Serena pinned, disabled, usage reporting disabled.')
