# Bedrock account prerequisites

This directory documents the manual account setup; it intentionally has no
Terraform model-access resource. Invocation permissions live in `../iam/`.
Select a model with the AI-explanations team before deployment. The Nova model
in `terraform.tfvars.example` is an example, not an approved product choice.

1. Sign in to the target AWS account, select the deployment region, and open
   the Amazon Bedrock model catalog. Confirm the chosen model is supported
   there and supports the application's intended invocation/prompt format.
2. Review provider terms and enable access using an administrator identity.
   Some models are automatically enabled on first invocation. Marketplace
   models require an administrator with subscription permissions and a valid
   payment method; Anthropic models require the first-time-use form. Complete
   those prerequisites and verify access in the playground before deployment.
   Activation and invocation are separate permissions. Do not add Marketplace
   subscription permissions to the application task role.
3. Set `bedrock_model_id` and **exact** `bedrock_model_arns` in your local
   Terraform variables. For direct invocation, use the foundation-model ARN
   in the chosen region. For cross-region inference, use the inference profile
   ID and list its ARN plus every permitted destination foundation-model ARN.
   Check SCPs and regional restrictions for all destinations. Wildcards are
   rejected by this configuration.
4. Confirm a model-specific test invocation succeeds. Account activation alone
   does not prove that the ECS role, regional routing, or prompt payload works.
   The application role grants only `bedrock:InvokeModel`, not streaming,
   fine-tuning, model management, or subscription operations. Add streaming
   permission separately only if the application actually requires it.

Model agreements can remain pending after submission, and some models require
additional account-level approval. Terraform validation cannot verify those
conditions. The administrator can use `aws bedrock get-foundation-model-availability
--model-id <foundation-model-id> --region <region>` with a current AWS CLI to
inspect availability (use the underlying model ID, not an inference profile).

Do not send raw invoice datasets to Bedrock. The application should submit only
the verified evidence needed for an explanation, respecting data-handling rules.

Reference: [AWS model access documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).