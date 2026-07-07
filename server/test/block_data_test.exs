defmodule BitcoinStream.BlockDataTest do
  use ExUnit.Case

  alias BitcoinStream.BlockData

  test "loads cached block id from map json" do
    json = ~s({"id":"abc"})

    assert BlockData.state_from_json(json) == {:ok, {"abc", json}}
  end

  test "loads cached block id from compact block json" do
    json = ~s([1,"abc",957000])

    assert BlockData.state_from_json(json) == {:ok, {"abc", json}}
  end

  test "falls back to tip hash when cache is missing" do
    assert BlockData.load_state(fn -> {:error, :enoent} end, fn -> {:ok, "tip"} end) ==
             {"tip", "null"}
  end

  test "falls back to tip hash when cache has no usable id" do
    assert BlockData.load_state(fn -> {:ok, ~s({"id":""})} end, fn -> {:ok, "tip"} end) ==
             {"tip", "null"}
  end

  test "starts without block id when cache and tip lookup fail" do
    assert BlockData.load_state(fn -> {:error, :enoent} end, fn -> :error end) ==
             {nil, "null"}
  end
end
