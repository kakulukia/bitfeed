defmodule BitcoinStream.MempoolTest do
  use ExUnit.Case

  alias BitcoinStream.Mempool

  setup do
    for table <- [:mempool_cache, :sync_cache, :block_cache], :ets.whereis(table) != :undefined do
      :ets.delete(table)
    end

    {:ok, pid} = Mempool.start_link([])
    {:ok, pid: pid}
  end

  test "tracks vbytes when raw tx arrives after the sequence event", %{pid: pid} do
    Mempool.set(pid, 1)
    :ets.insert(:mempool_cache, {"tx1", nil, :ready})

    assert Mempool.get_vbytes(pid) == 0
    assert Mempool.insert(pid, "tx1", tx("tx1", 250)) == 1
    assert Mempool.get_vbytes(pid) == 250
    assert Mempool.drop(pid, "tx1") == 0
    assert Mempool.get_vbytes(pid) == 0
  end

  test "sets count and vbytes from node mempool stats", %{pid: pid} do
    assert Mempool.set(pid, 55_703, 31_000_000) == :ok
    assert Mempool.get(pid) == 55_703
    assert Mempool.get_vbytes(pid) == 31_000_000
  end

  test "tracks vbytes when raw tx arrives before the sequence event", %{pid: pid} do
    mark_synced(pid)

    assert Mempool.insert(pid, "tx1", tx("tx1", 400)) == false
    assert Mempool.get_vbytes(pid) == 0

    {txn, count} = Mempool.register(pid, "tx1", 1, true)
    assert txn.id == "tx1"
    assert count == 1
    assert Mempool.get_vbytes(pid) == 400
  end

  defp mark_synced(pid) do
    :sys.replace_state(pid, fn {count, vbytes, _seq, queue, done, blocklock} ->
      {count, vbytes, 0, queue, done, blocklock}
    end)
  end

  defp tx(id, vbytes) do
    %{id: id, inputs: [], value: 1000, fee: 10, inflated: true, vbytes: vbytes}
  end
end
