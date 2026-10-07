//! Generated contract for Console Workspace UI contributions.

include!("generated.rs");

// Keep payload vocabulary stable while the Operation name is explicit enough
// for a cohesive Plugin to provide UI and HTTP Capabilities together.
pub use self::{
    DescribeContributionError as DescribeError, DescribeContributionRequest as DescribeRequest,
    DescribeContributionResponse as DescribeResponse,
    DescribeContributionResponseAssetsItem as DescribeResponseAssetsItem,
    DescribeContributionResponseAssetsItemMediaType as DescribeResponseAssetsItemMediaType,
    DescribeContributionResponseNavigation as DescribeResponseNavigation,
    DescribeContributionResponseNavigationItemsItem as DescribeResponseNavigationItemsItem,
    DescribeContributionResponseRequirementsItem as DescribeResponseRequirementsItem,
    DescribeContributionResponseRequirementsItemSource as DescribeResponseRequirementsItemSource,
    DescribeContributionResponseSubject as DescribeResponseSubject,
    DescribeContributionResponseSubjectKind as DescribeResponseSubjectKind,
};
