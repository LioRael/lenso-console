#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    lenso_console_host_example::app()
        .bind("127.0.0.1:3031".parse()?)
        .run()
        .await?;
    Ok(())
}
