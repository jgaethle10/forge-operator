import importlib.util
import pathlib
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'check-evercraft-service-integrity.py'
spec = importlib.util.spec_from_file_location('service_integrity', path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class EntrypointParsing(unittest.TestCase):
    def test_direct_node(self):
        self.assertEqual(mod.entrypoint_from_execstart(
            '{ path=/usr/bin/node ; argv[]=/usr/bin/node /opt/evercraft/run.mjs --run ; }'),
            '/opt/evercraft/run.mjs')

    def test_non_node_is_unassessed(self):
        self.assertIsNone(mod.entrypoint_from_execstart(
            '{ path=/bin/bash ; argv[]=/bin/bash /opt/evercraft/update.sh ; }'))

    def test_ambiguous_scripts_are_unassessed(self):
        self.assertIsNone(mod.entrypoint_from_execstart(
            '{ argv[]=/usr/bin/node /one.mjs /two.mjs ; }'))

    @patch.object(mod, 'run_systemctl')
    def test_missing_file_is_not_restart_ready(self, mock):
        mock.return_value.returncode = 0
        mock.return_value.stdout = ('ActiveState=active\nMainPID=407\n'
          'ExecStart={ path=/usr/bin/node ; argv[]=/usr/bin/node /missing-test-evercraft.mjs --run ; }\n')
        record = mod.inspect('evercraft-remote-broker-resident.service')
        self.assertEqual(record['assessment'], 'missing_entrypoint')
        self.assertFalse(record['restart_ready'])


if __name__ == '__main__':
    unittest.main()
