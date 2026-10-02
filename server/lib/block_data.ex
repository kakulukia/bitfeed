Application.ensure_all_started(BitcoinStream.RPC)

require Logger

defmodule BitcoinStream.BlockData do
  @moduledoc """
  Block data module.

  Maintains a flat-file db of blocks (if enabled)
  Serves a cached copy of the latest block
  """
  use GenServer
  use Task, restart: :transient

  alias BitcoinStream.RPC, as: RPC

  def start_link(opts) do
    Logger.info("Starting block data link");
    GenServer.start_link(__MODULE__, load_state(), opts)
  end

  @doc false
  def load_state(read_cache \\ &read_cached_block/0, fetch_hash \\ &fetch_tip_hash/0) do
    case read_cache.() do
      {:ok, json} ->
        case state_from_json(json) do
          {:ok, state} -> state
          _ -> state_from_tip(fetch_hash)
        end

      _ -> state_from_tip(fetch_hash)
    end
  end

  @doc false
  def state_from_json(json) do
    with {:ok, block} <- Jason.decode(json),
         id when is_binary(id) and id != "" <- block_id(block) do
      {:ok, {id, json}}
    else
      _ -> :error
    end
  end

  defp read_cached_block do
    File.read("data/last_block.json")
  end

  defp state_from_tip(fetch_hash) do
    case fetch_hash.() do
      {:ok, hash} -> {hash, "null"}
      _ -> {nil, "null"}
    end
  end

  defp fetch_tip_hash do
    case RPC.request(:rpc, "getbestblockhash", []) do
      {:ok, 200, hash} when is_binary(hash) -> {:ok, hash}
      err ->
        Logger.info("Starting without cached block id: #{inspect(err)}")
        :error
    end
  end

  defp block_id(%{"id" => id}), do: id
  defp block_id([_, id | _]), do: id
  defp block_id(_), do: nil

  @impl true
  def init(state) do
    {:ok, state}
  end

  @impl true
  def handle_call(:block_id, _from, {id, json}) do
    {:reply, id, {id, json}}
  end

  @impl true
  def handle_call(:json_block, _from, {id, json}) do
    {:reply, json, {id, json}}
  end

  @impl true
  def handle_call({:json, {id, json}}, _from, _state) do
      {:reply, :ok, {id, json}}
  end

  def get_json_block(pid) do
    GenServer.call(pid, :json_block, 10000)
  end

  def get_block_id(pid) do
    GenServer.call(pid, :block_id, 10000)
  end

  def set_json_block(pid, block_id, json) do
    GenServer.call(pid, {:json, { block_id, json }}, 10000)
  end

  def clean_block(block) do
    {txs, value, fees} = clean_txs(block["tx"]);
    {:ok, [
      block["version"],
      block["hash"],
      block["height"],
      value,
      block["previousblockhash"],
      block["time"],
      block["bits"],
      block["size"],
      txs,
      fees
    ]}
  end

  defp clean_txs([], clean, value, fees) do
    {Enum.reverse(clean), value, fees}
  end
  defp clean_txs([tx | rest], clean, value, fees) do
    {cleantx, txvalue, txfee} = clean_tx(tx)
    clean_txs(rest, [cleantx | clean], value + txvalue, fees + txfee)
  end
  defp clean_txs(txs) do
    clean_txs(txs, [], 0, 0)
  end

  defp clean_tx(tx) do
    total_value = sum_output_values(tx["vout"]);
    outputs = clean_outputs(tx["vout"]);
    fee = if tx["fee"] != nil do round(tx["fee"] * 100000000) else 0 end
    {[
      tx["version"],
      tx["txid"],
      fee,
      total_value,
      tx["vsize"],
      length(tx["vin"]),
      outputs
    ], total_value, fee}
  end

  defp clean_outputs([], clean) do
    Enum.reverse(clean)
  end
  defp clean_outputs([out | rest], clean) do
    clean_outputs(rest, [clean_output(out) | clean])
  end
  defp clean_outputs(outputs) do
    clean_outputs(outputs, [])
  end

  defp clean_output(output) do
    [
      round(output["value"] * 100000000),
      output["scriptPubKey"]["hex"]
    ]
  end

  defp sum_output_values([], value) do
    value
  end
  defp sum_output_values([out|rest], value) do
    sum_output_values(rest, value + round(out["value"] * 100000000))
  end
  defp sum_output_values(outputs) do
    sum_output_values(outputs, 0)
  end
end
