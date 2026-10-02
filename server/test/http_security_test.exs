defmodule BitcoinStream.HttpSecurityTest.Handler do
  def init(req, header) do
    req = :cowboy_req.reply(200, %{"x-remix-structured" => header}, "ok", req)
    {:ok, req, nil}
  end
end

defmodule BitcoinStream.HttpSecurityTest do
  use ExUnit.Case

  setup_all do
    {:ok, _} = Application.ensure_all_started(:cowboy)
    :ok
  end

  test "accepts a valid structured response header" do
    response = request("safe")
    assert response =~ "HTTP/1.1 200"
    assert response =~ "x-remix-structured: \"safe\""
  end

  @tag capture_log: true
  test "rejects a Cowlib structured header containing CRLF before transmission" do
    response = request("unsafe\r\nx-remix-injected: yes")
    assert response =~ "HTTP/1.1 500"
    refute response =~ "x-remix-injected:"
    refute response =~ "x-remix-structured:"
  end

  test "audit exceptions stay limited to the reviewed dependency versions" do
    for {app, version} <- [cowlib: "2.20.0", cowboy: "2.19.0"] do
      assert Application.spec(app, :vsn) == to_charlist(version)
    end
  end

  test "the application and its other dependencies do not import the vulnerable cookie encoder" do
    beams = Path.wildcard(Path.join(Mix.Project.build_path(), "lib/*/ebin/*.beam"))
    assert Enum.any?(beams, &String.ends_with?(&1, "/Elixir.BitcoinStream.Router.beam"))

    callers =
      beams
      |> Enum.reject(&String.contains?(&1, "/cowlib/ebin/"))
      |> Enum.filter(fn file ->
        {:ok, {_, [{:imports, imports}]}} = :beam_lib.chunks(String.to_charlist(file), [:imports])
        {:cow_cookie, :cookie, 1} in imports
      end)

    assert callers == []
  end

  defp request(value) do
    header = :cow_http_struct_hd.item({:item, {:string, value}, []}) |> IO.iodata_to_binary()

    dispatch =
      :cowboy_router.compile([{:_, [{"/", BitcoinStream.HttpSecurityTest.Handler, header}]}])

    {:ok, _} =
      :cowboy.start_clear(:remix_header_probe, %{socket_opts: [port: 0]}, %{
        env: %{dispatch: dispatch}
      })

    on_exit(fn -> :cowboy.stop_listener(:remix_header_probe) end)
    port = :ranch.get_port(:remix_header_probe)
    {:ok, socket} = :gen_tcp.connect({127, 0, 0, 1}, port, [:binary, active: false], 5000)
    :ok = :gen_tcp.send(socket, "GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
    {:ok, response} = :gen_tcp.recv(socket, 0, 5000)
    :gen_tcp.close(socket)
    response
  end
end
