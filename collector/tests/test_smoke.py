from hamzzi_collector import main


def test_main_without_command_prints_help(capsys):
    assert main([]) == 0
    assert "hamzzi-collector" in capsys.readouterr().out
