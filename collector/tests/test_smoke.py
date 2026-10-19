from hamzzi_collector import main


def test_main_runs(capsys):
    main()
    assert "hamzzi-collector" in capsys.readouterr().out
